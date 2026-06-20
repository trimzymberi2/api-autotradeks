import pool from "../config/db.js";
import cloudinary from "../config/cloudinary.js";
import { logError } from "../utils/logError.js";

export const createRentCar = async (req, res) => {
  try {
    const {
      title,
      description,
      price_per_day,
      weekly_offer_price,
      monthly_offer_price,
      minimum_days,
      brand,
      model,
      year,
      mileage,
      fuel_type,
      transmission,
      city,
      motor,
      customs,
      drivesystem,
      color,
      seats,
      with_driver,
      available_from,
      available_to,
    } = req.body;

    const rentCarResult = await pool.query(
      `INSERT INTO rent_cars 
      (title, description, price_per_day, weekly_offer_price, monthly_offer_price, minimum_days,
       brand, model, year, mileage, fuel_type, transmission, city, motor, customs, drivesystem,
       color, seats, with_driver, available_from, available_to, user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      RETURNING *`,
      [
        title,
        description,
        price_per_day,
        weekly_offer_price || null,
        monthly_offer_price || null,
        minimum_days || 1,
        brand,
        model,
        year,
        mileage,
        fuel_type,
        transmission,
        city,
        motor,
        customs === "true" || customs === true,
        drivesystem,
        color,
        seats,
        with_driver === "true" || with_driver === true,
        available_from || null,
        available_to || null,
        req.user.id,
      ]
    );

    const rentCar = rentCarResult.rows[0];

    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map((file) =>
        cloudinary.uploader.upload(file.path)
      );

      const results = await Promise.all(uploadPromises);

      for (const result of results) {
        await pool.query(
          "INSERT INTO rent_car_images (rent_car_id, image_url) VALUES ($1, $2)",
          [rentCar.id, result.secure_url]
        );
      }
    }

    res.json(rentCar);
  } catch (err) {
    logError("POST /api/rent-cars", err);
    res.status(500).json({
      message: "Error creating rent car",
      error: err.message,
    });
  }
};

export const getRentCars = async (req, res) => {
  try {
    const {
      user_id,
      brand,
      model,
      minPrice,
      maxPrice,
      minYear,
      maxYear,
      fuel_type,
      transmission,
      city,
      customs,
      drivesystem,
      color,
      minMotor,
      maxMotor,
      minKm,
      maxKm,
      seats,
      with_driver,
      page = 1,
      limit = 12,
    } = req.query;

    const currentPage = Number(page) || 1;
    const perPage = Number(limit) || 12;
    const offset = (currentPage - 1) * perPage;

    let baseQuery = `
      FROM rent_cars
      JOIN users ON rent_cars.user_id = users.id
      WHERE 1=1
    `;

    const values = [];

    if (user_id) {
      values.push(user_id);
      baseQuery += ` AND rent_cars.user_id = $${values.length}`;
    }

    if (brand) {
      values.push(brand);
      baseQuery += ` AND rent_cars.brand = $${values.length}`;
    }

    if (model) {
      values.push(model);
      baseQuery += ` AND rent_cars.model = $${values.length}`;
    }

    if (minPrice) {
      values.push(minPrice);
      baseQuery += ` AND rent_cars.price_per_day >= $${values.length}`;
    }

    if (maxPrice) {
      values.push(maxPrice);
      baseQuery += ` AND rent_cars.price_per_day <= $${values.length}`;
    }

    if (minYear) {
      values.push(minYear);
      baseQuery += ` AND rent_cars.year >= $${values.length}`;
    }

    if (maxYear) {
      values.push(maxYear);
      baseQuery += ` AND rent_cars.year <= $${values.length}`;
    }

    if (fuel_type) {
      values.push(fuel_type);
      baseQuery += ` AND rent_cars.fuel_type = $${values.length}`;
    }

    if (transmission) {
      values.push(transmission);
      baseQuery += ` AND rent_cars.transmission = $${values.length}`;
    }

    if (city) {
      values.push(city);
      baseQuery += ` AND rent_cars.city = $${values.length}`;
    }

    if (customs !== undefined) {
      values.push(customs === "true");
      baseQuery += ` AND rent_cars.customs = $${values.length}`;
    }

    if (drivesystem) {
      values.push(drivesystem);
      baseQuery += ` AND rent_cars.drivesystem = $${values.length}`;
    }

    if (color) {
      values.push(color);
      baseQuery += ` AND rent_cars.color = $${values.length}`;
    }

    if (minMotor) {
      values.push(minMotor);
      baseQuery += ` AND rent_cars.motor >= $${values.length}`;
    }

    if (maxMotor) {
      values.push(maxMotor);
      baseQuery += ` AND rent_cars.motor <= $${values.length}`;
    }

    if (minKm) {
      values.push(minKm);
      baseQuery += ` AND rent_cars.mileage >= $${values.length}`;
    }

    if (maxKm) {
      values.push(maxKm);
      baseQuery += ` AND rent_cars.mileage <= $${values.length}`;
    }

    if (seats) {
      values.push(seats);
      baseQuery += ` AND rent_cars.seats = $${values.length}`;
    }

    if (with_driver !== undefined) {
      values.push(with_driver === "true");
      baseQuery += ` AND rent_cars.with_driver = $${values.length}`;
    }

    const countQuery = `SELECT COUNT(*) ${baseQuery}`;
    const countResult = await pool.query(countQuery, values);
    const totalRentCars = Number(countResult.rows[0].count);
    const totalPages = Math.ceil(totalRentCars / perPage);

    values.push(perPage);
    values.push(offset);

    const rentCarsQuery = `
      SELECT 
        rent_cars.*,
        users.name AS user_name,
        users.phone AS user_phone
      ${baseQuery}
      ORDER BY rent_cars.created_at DESC
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
    `;

    const rentCarsResult = await pool.query(rentCarsQuery, values);
    const rentCars = rentCarsResult.rows;

    for (const rentCar of rentCars) {
      const imagesResult = await pool.query(
        "SELECT image_url FROM rent_car_images WHERE rent_car_id = $1",
        [rentCar.id]
      );

      rentCar.images = imagesResult.rows.map((img) => img.image_url);

      rentCar.user = {
        name: rentCar.user_name,
        phone: rentCar.user_phone,
      };

      delete rentCar.user_name;
      delete rentCar.user_phone;
    }

    res.json({
      page: currentPage,
      limit: perPage,
      totalRentCars,
      totalPages,
      rentCars,
    });
  } catch (err) {
    logError("GET /api/rent-cars", err);
    res.status(500).json({ message: "Error fetching rent cars" });
  }
};

export const getRentCarById = async (req, res) => {
  try {
    const rentCarResult = await pool.query(
      `
      SELECT 
        rent_cars.*,
        users.name AS user_name,
        users.phone AS user_phone
      FROM rent_cars
      JOIN users ON rent_cars.user_id = users.id
      WHERE rent_cars.id = $1
      `,
      [req.params.id]
    );

    const rentCar = rentCarResult.rows[0];

    if (!rentCar) {
      return res.status(404).json({ message: "Rent car not found" });
    }

    const imagesResult = await pool.query(
      "SELECT image_url FROM rent_car_images WHERE rent_car_id = $1",
      [rentCar.id]
    );

    rentCar.images = imagesResult.rows.map((img) => img.image_url);

    rentCar.user = {
      name: rentCar.user_name,
      phone: rentCar.user_phone,
    };

    delete rentCar.user_name;
    delete rentCar.user_phone;

    res.json(rentCar);
  } catch (err) {
    logError("GET /api/rent-cars/:id", err);
    res.status(500).json({ message: "Error fetching rent car" });
  }
};

export const getPromotedRentCars = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        rent_cars.*,
        users.name AS user_name,
        users.phone AS user_phone,
        promoted_rent_cars.position
      FROM promoted_rent_cars
      JOIN rent_cars ON promoted_rent_cars.rent_car_id = rent_cars.id
      JOIN users ON rent_cars.user_id = users.id
      WHERE promoted_rent_cars.is_active = true
      ORDER BY promoted_rent_cars.position ASC, promoted_rent_cars.created_at DESC
    `);

    const rentCars = result.rows;

    for (const rentCar of rentCars) {
      const imagesResult = await pool.query(
        "SELECT image_url FROM rent_car_images WHERE rent_car_id = $1",
        [rentCar.id]
      );

      rentCar.images = imagesResult.rows.map((img) => img.image_url);

      rentCar.user = {
        name: rentCar.user_name,
        phone: rentCar.user_phone,
      };

      delete rentCar.user_name;
      delete rentCar.user_phone;
    }

    res.json(rentCars);
  } catch (err) {
    logError("GET /api/rent-cars/promoted", err);
    res.status(500).json({ message: "Error fetching promoted rent cars" });
  }
};