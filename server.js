const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT) || 10000;
const DATA_FILE = path.join(__dirname, "world.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const initialWorld = {
  year: 2016,
  lastTick: Date.now(),
  treasury: 250000,
  cities: [],
  villages: [],
  structures: [],
  events: [],
  player: {
    name: "Гравець",
    country: "Нова Україна"
  }
};

function loadWorld() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (error) {
    console.error(error);
  }

  return structuredClone(initialWorld);
}

let world = loadWorld();

function saveWorld() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(world, null, 2)
    );
  } catch (error) {
    console.error("Помилка збереження:", error);
  }
}

function tick() {
  const now = Date.now();

  const elapsed = Math.max(
    0,
    Math.min(now - world.lastTick, 86400000)
  );

  const hours = elapsed / 3600000;

  if (hours > 0) {
    world.cities.forEach(city => {
      const growth = Math.floor(
        city.population * 0.00015 * hours
      );

      city.population += growth;

      city.happiness = Math.max(
        0,
        Math.min(
          100,
          city.happiness + (city.food > 0 ? 0.01 : -0.08) * hours
        )
      );

      city.food = Math.max(
        0,
        city.food - Math.ceil(city.population * 0.0008 * hours)
      );
    });

    world.villages.forEach(village => {
      village.population += Math.floor(
        village.population * 0.0001 * hours
      );
    });

    world.year += hours / (24 * 365);
    world.lastTick = now;

    saveWorld();
  }
}

app.get("/api/world", (req, res) => {
  tick();
  res.json(world);
});

app.post("/api/country", (req, res) => {
  const name = String(req.body.name || "")
    .trim()
    .slice(0, 32);

  if (!name) {
    return res.status(400).json({
      error: "Введіть назву держави."
    });
  }

  world.player.country = name;

  saveWorld();
  res.json(world);
});

app.post("/api/cities", (req, res) => {
  const name = String(req.body.name || "")
    .trim()
    .slice(0, 32);

  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);

  if (
    !name ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < 44 ||
    lat > 53 ||
    lng < 22 ||
    lng > 41
  ) {
    return res.status(400).json({
      error: "Оберіть точку в межах України та введіть назву міста."
    });
  }

  if (world.cities.length >= 20) {
    return res.status(400).json({
      error: "У демоверсії можна заснувати до 20 міст."
    });
  }

  if (
    world.cities.some(city =>
      Math.abs(city.lat - lat) < 0.08 &&
      Math.abs(city.lng - lng) < 0.08
    )
  ) {
    return res.status(400).json({
      error: "Поруч уже є ваше місто."
    });
  }

  const city = {
    id: Date.now().toString(36),
    name,
    lat,
    lng,
    population: 1000,
    happiness: 75,
    food: 5000,
    level: "Місто",
    founded: new Date().toISOString()
  };

  world.cities.push(city);
  world.treasury -= 50000;

  saveWorld();
  res.json(city);
});

app.post("/api/villages", (req, res) => {
  const city = world.cities.find(
    item => item.id === req.body.cityId
  );

  if (!city) {
    return res.status(404).json({
      error: "Місто не знайдено."
    });
  }

  if (world.treasury < 10000) {
    return res.status(400).json({
      error: "Недостатньо гривень."
    });
  }

  world.treasury -= 10000;

  const village = {
    id: Date.now().toString(36),
    name: String(req.body.name || "Нове село").slice(0, 32),
    lat: city.lat + (Math.random() - 0.5) * 0.12,
    lng: city.lng + (Math.random() - 0.5) * 0.12,
    population: 120
  };

  world.villages.push(village);

  saveWorld();
  res.json(village);
});

const prices = {
  factory: 80000,
  farm: 25000,
  mine: 60000,
  shop: 15000,
  port: 120000,
  bridge: 90000,
  road: 12000
};

app.post("/api/build", (req, res) => {
  const city = world.cities.find(
    item => item.id === req.body.cityId
  );

  const type = req.body.type;

  if (!city || !prices[type]) {
    return res.status(400).json({
      error: "Невірне місто або споруда."
    });
  }

  if (world.treasury < prices[type]) {
    return res.status(400).json({
      error: "Недостатньо гривень."
    });
  }

  world.treasury -= prices[type];

  world.structures.push({
    id: Date.now().toString(36),
    cityId: city.id,
    type,
    name: type,
    lat: city.lat + (Math.random() - 0.5) * 0.025,
    lng: city.lng + (Math.random() - 0.5) * 0.025
  });

  saveWorld();
  res.json(world);
});

app.post("/api/job", (req, res) => {
  const city = world.cities.find(
    item => item.id === req.body.cityId
  );

  if (!city) {
    return res.status(404).json({
      error: "Місто не знайдено."
    });
  }

  world.treasury += 1200;

  saveWorld();

  res.json({
    message: "Ви відпрацювали зміну та отримали 1 200 ₴.",
    world
  });
});

app.listen(PORT, () => {
  console.log(`Сервер гри працює на порті ${PORT}`);
});