import pool from "../config/db.js";
import cloudinary from "../config/cloudinary.js";
import { logError } from "../utils/logError.js";

export const createCar = async (req, res) => {
  try {
    const {
      title,
      description,
      price,
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
    } = req.body;

    const carResult = await pool.query(
      `INSERT INTO cars 
      (title, description, price, brand, model, year, mileage, fuel_type, transmission, city, motor, customs, drivesystem, color, user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *`,
      [
        title,
        description,
        price,
        brand,
        model,
        year,
        mileage,
        fuel_type,
        transmission,
        city,
        motor,
        customs === "true",
        drivesystem,
        color,
        req.user.id,
      ]
    );

    const car = carResult.rows[0];

    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map((file) =>
        cloudinary.uploader.upload(file.path)
      );

      const results = await Promise.all(uploadPromises);

      for (const result of results) {
        await pool.query(
          "INSERT INTO car_images (car_id, image_url) VALUES ($1, $2)",
          [car.id, result.secure_url]
        );
      }
    }

    res.json(car);
  } catch (err) {
    logError("POST /api/cars", err);
    res.status(500).json({
      message: "Error creating car",
      error: err.message,
    });
  }
};

export const getCarsByUser = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT c.*, 
        COALESCE(
          json_agg(
            ci.image_url
          ) FILTER (WHERE ci.image_url IS NOT NULL), '[]'
        ) as images
      FROM cars c
      LEFT JOIN car_images ci ON c.id = ci.car_id
      WHERE c.user_id = $1
      GROUP BY c.id
      ORDER BY c.created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    logError("GET /api/cars/my-cars", err);
    res.status(500).json({ message: "Error fetching user cars", error: err.message });
  }
};

export const getCars = async (req, res) => {
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
      page = 1,
      limit = 12,
    } = req.query;

    const currentPage = Number(page) || 1;
    const perPage = Number(limit) || 12;
    const offset = (currentPage - 1) * perPage;

    let baseQuery = `
      FROM cars
      JOIN users ON cars.user_id = users.id
      WHERE 1=1
    `;

    const values = [];

    if (user_id) {
      values.push(user_id);
      baseQuery += ` AND cars.user_id = $${values.length}`;
    }

    if (brand) {
      values.push(brand);
      baseQuery += ` AND cars.brand = $${values.length}`;
    }

    if (model) {
      values.push(model);
      baseQuery += ` AND cars.model = $${values.length}`;
    }

    if (minPrice) {
      values.push(minPrice);
      baseQuery += ` AND cars.price >= $${values.length}`;
    }

    if (maxPrice) {
      values.push(maxPrice);
      baseQuery += ` AND cars.price <= $${values.length}`;
    }

    if (minYear) {
      values.push(minYear);
      baseQuery += ` AND cars.year >= $${values.length}`;
    }

    if (maxYear) {
      values.push(maxYear);
      baseQuery += ` AND cars.year <= $${values.length}`;
    }

    if (fuel_type) {
      values.push(fuel_type);
      baseQuery += ` AND cars.fuel_type = $${values.length}`;
    }

    if (transmission) {
      values.push(transmission);
      baseQuery += ` AND cars.transmission = $${values.length}`;
    }

    if (city) {
      values.push(city);
      baseQuery += ` AND cars.city = $${values.length}`;
    }

    if (customs !== undefined) {
      values.push(customs === "true");
      baseQuery += ` AND cars.customs = $${values.length}`;
    }

    if (drivesystem) {
      values.push(drivesystem);
      baseQuery += ` AND cars.drivesystem = $${values.length}`;
    }

    if (color) {
      values.push(color);
      baseQuery += ` AND cars.color = $${values.length}`;
    }

    if (minMotor) {
      values.push(minMotor);
      baseQuery += ` AND cars.motor >= $${values.length}`;
    }

    if (maxMotor) {
      values.push(maxMotor);
      baseQuery += ` AND cars.motor <= $${values.length}`;
    }

    if (minKm) {
      values.push(minKm);
      baseQuery += ` AND cars.mileage >= $${values.length}`;
    }

    if (maxKm) {
      values.push(maxKm);
      baseQuery += ` AND cars.mileage <= $${values.length}`;
    }

    const countQuery = `SELECT COUNT(*) ${baseQuery}`;
    const countResult = await pool.query(countQuery, values);
    const totalCars = Number(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCars / perPage);

    values.push(perPage);
    values.push(offset);

    const carsQuery = `
      SELECT 
        cars.*,
        users.name AS user_name,
        users.phone AS user_phone
      ${baseQuery}
      ORDER BY cars.created_at DESC
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
    `;

    const carsResult = await pool.query(carsQuery, values);
    const cars = carsResult.rows;

    for (const car of cars) {
      const imagesResult = await pool.query(
        "SELECT image_url FROM car_images WHERE car_id = $1",
        [car.id]
      );

      car.images = imagesResult.rows.map((img) => img.image_url);

      car.user = {
        name: car.user_name,
        phone: car.user_phone,
      };

      delete car.user_name;
      delete car.user_phone;
    }

    res.json({
      page: currentPage,
      limit: perPage,
      totalCars,
      totalPages,
      cars,
    });
  } catch (err) {
    logError("GET /api/cars", err);
    res.status(500).json({ message: "Error fetching cars" });
  }
};

export const getCarById = async (req, res) => {
  try {
    const carResult = await pool.query(
      `
      SELECT 
        cars.*,
        users.name AS user_name,
        users.phone AS user_phone
      FROM cars
      JOIN users ON cars.user_id = users.id
      WHERE cars.id = $1
      `,
      [req.params.id]
    );

    const car = carResult.rows[0];

    if (!car) {
      return res.status(404).json({ message: "Car not found" });
    }

    const imagesResult = await pool.query(
      "SELECT image_url FROM car_images WHERE car_id = $1",
      [car.id]
    );

    car.images = imagesResult.rows.map((img) => img.image_url);

    car.user = {
      name: car.user_name,
      phone: car.user_phone,
    };

    delete car.user_name;
    delete car.user_phone;

    res.json(car);
  } catch (err) {
    logError("GET /api/cars/:id", err);
    res.status(500).json({ message: "Error fetching car" });
  }
};

export const updateCar = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    const {
      title,
      description,
      price,
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
      imagesToDelete = [],
    } = req.body;

    await client.query("BEGIN");

    const result = await client.query("SELECT * FROM cars WHERE id=$1", [id]);
    const car = result.rows[0];

    if (!car) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Car not found" });
    }

    if (car.user_id !== req.user.id) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Not authorized" });
    }

    const updated = await client.query(
      `UPDATE cars 
       SET title=$1, description=$2, price=$3, brand=$4, model=$5, year=$6,
           mileage=$7, fuel_type=$8, transmission=$9, city=$10, motor=$11,
           customs=$12, drivesystem=$13, color=$14
       WHERE id=$15
       RETURNING *`,
      [
        title,
        description,
        price,
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
        id,
      ]
    );

    const imagesToDeleteList = Array.isArray(imagesToDelete)
      ? imagesToDelete
      : imagesToDelete
        ? [imagesToDelete]
        : [];

    if (imagesToDeleteList.length > 0) {
      for (const imageUrl of imagesToDeleteList) {
        const imageResult = await client.query(
          "SELECT image_url FROM car_images WHERE car_id=$1 AND image_url=$2",
          [id, imageUrl]
        );

        if (imageResult.rows.length === 0) {
          continue;
        }

        const publicId = imageUrl
          .split("/upload/")[1]
          ?.replace(/^v\d+\//, "")
          ?.replace(/\.[^/.]+$/, "");

        if (publicId) {
          await cloudinary.uploader.destroy(publicId);
        }

        await client.query(
          "DELETE FROM car_images WHERE car_id=$1 AND image_url=$2",
          [id, imageUrl]
        );
      }
    }

    await client.query("COMMIT");

    res.json(updated.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    logError("PUT /api/cars/:id", err);
    res.status(500).json({
      message: "Error updating car",
      error: err.message,
    });
  } finally {
    client.release();
  }
};

export const deleteCar = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "SELECT * FROM cars WHERE id=$1",
      [id]
    );

    const car = result.rows[0];

    if (!car) {
      return res.status(404).json({ message: "Car not found" });
    }
    
    if (car.user_id !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await pool.query("DELETE FROM cars WHERE id=$1", [id]);

    res.json({ message: "Car deleted" });
  } catch (err) {
    logError("DELETE /api/cars/:id", err);
    res.status(500).json({ message: "Error deleting car" });
  }
};

export const getPromotedCars = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        cars.*,
        users.name AS user_name,
        users.phone AS user_phone,
        promoted_cars.position
      FROM promoted_cars
      JOIN cars ON promoted_cars.car_id = cars.id
      JOIN users ON cars.user_id = users.id
      WHERE promoted_cars.is_active = true
      ORDER BY promoted_cars.position ASC, promoted_cars.created_at DESC
    `);

    const cars = result.rows;

    for (const car of cars) {
      const imagesResult = await pool.query(
        "SELECT image_url FROM car_images WHERE car_id = $1",
        [car.id]
      );

      car.images = imagesResult.rows.map((img) => img.image_url);

      car.user = {
        name: car.user_name,
        phone: car.user_phone,
      };

      delete car.user_name;
      delete car.user_phone;
    }

    res.json(cars);
  } catch (err) {
    logError("GET /api/cars/promoted", err);
    res.status(500).json({ message: "Error fetching promoted cars" });
  }
};