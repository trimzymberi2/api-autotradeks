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
      allowed_countries,
      available_from,
      available_to,
    } = req.body;

    const rentCarResult = await pool.query(
      `INSERT INTO rent_cars 
      (title, description, price_per_day, weekly_offer_price, monthly_offer_price, minimum_days,
       brand, model, year, mileage, fuel_type, transmission, city, motor, customs, drivesystem,
       color, seats, with_driver, allowed_countries, available_from, available_to, user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
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
        allowed_countries || null,
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

export const getRentCarsByUser = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT rc.*, 
        COALESCE(
          json_agg(
            rci.image_url
          ) FILTER (WHERE rci.image_url IS NOT NULL), '[]'
        ) as images,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', rcud.id,
                'unavailable_from', rcud.unavailable_from,
                'unavailable_to', rcud.unavailable_to,
                'reason', rcud.reason
              )
              ORDER BY rcud.unavailable_from ASC
            )
            FROM rent_car_unavailable_dates rcud
            WHERE rcud.rent_car_id = rc.id
          ),
          '[]'
        ) as unavailable_dates
      FROM rent_cars rc
      LEFT JOIN rent_car_images rci ON rc.id = rci.rent_car_id
      WHERE rc.user_id = $1
      GROUP BY rc.id
      ORDER BY rc.created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    logError("GET /api/rent-cars/user/my-rent-cars", err);
    res.status(500).json({
      message: "Error fetching user rent cars",
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
      allowed_countries,
      available_from,
      available_to,
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

    if (allowed_countries) {
      const selectedCountries = allowed_countries
        .split(",")
        .map((country) => country.trim())
        .filter(Boolean);

      if (selectedCountries.length > 0) {
        const countryConditions = selectedCountries.map((country) => {
          values.push(`%${country}%`);
          return `rent_cars.allowed_countries ILIKE $${values.length}`;
        });

        baseQuery += ` AND (${countryConditions.join(" OR ")})`;
      }
    }

    const requestedFrom = available_from || available_to;
    const requestedTo = available_to || available_from;

    if (requestedFrom && requestedTo) {
      values.push(requestedTo);
      const requestedToIndex = values.length;
      values.push(requestedFrom);
      const requestedFromIndex = values.length;
      baseQuery += `
        AND NOT EXISTS (
          SELECT 1
          FROM rent_car_unavailable_dates rcud
          WHERE rcud.rent_car_id = rent_cars.id
            AND rcud.unavailable_from::date <= $${requestedToIndex}::date
            AND rcud.unavailable_to::date >= $${requestedFromIndex}::date
        )
      `;
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

function parseImagesToDelete(imagesToDelete) {
  if (!imagesToDelete) return [];

  if (Array.isArray(imagesToDelete)) {
    return imagesToDelete;
  }

  if (typeof imagesToDelete === "string") {
    try {
      const parsed = JSON.parse(imagesToDelete);
      return Array.isArray(parsed) ? parsed : [imagesToDelete];
    } catch {
      return [imagesToDelete];
    }
  }

  return [];
}

function getCloudinaryPublicId(imageUrl) {
  return imageUrl
    .split("/upload/")[1]
    ?.replace(/^v\d+\//, "")
    ?.replace(/\.[^/.]+$/, "");
}

export const updateRentCar = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
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
      allowed_countries,
      available_from,
      available_to,
      imagesToDelete,
    } = req.body;

    await client.query("BEGIN");

    const existingResult = await client.query("SELECT * FROM rent_cars WHERE id=$1", [id]);
    const rentCar = existingResult.rows[0];

    if (!rentCar) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Rent car not found" });
    }

    if (rentCar.user_id !== req.user.id) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Not authorized" });
    }

    const updated = await client.query(
      `UPDATE rent_cars
       SET title=$1, description=$2, price_per_day=$3, weekly_offer_price=$4,
           monthly_offer_price=$5, minimum_days=$6, brand=$7, model=$8, year=$9,
           mileage=$10, fuel_type=$11, transmission=$12, city=$13, motor=$14,
           customs=$15, drivesystem=$16, color=$17, seats=$18, with_driver=$19,
           allowed_countries=$20, available_from=$21, available_to=$22
       WHERE id=$23
       RETURNING *`,
      [
        title ?? rentCar.title,
        description ?? rentCar.description,
        price_per_day ?? rentCar.price_per_day,
        weekly_offer_price === "" ? null : weekly_offer_price ?? rentCar.weekly_offer_price,
        monthly_offer_price === "" ? null : monthly_offer_price ?? rentCar.monthly_offer_price,
        minimum_days ?? rentCar.minimum_days,
        brand ?? rentCar.brand,
        model ?? rentCar.model,
        year === "" ? null : year ?? rentCar.year,
        mileage === "" ? null : mileage ?? rentCar.mileage,
        fuel_type ?? rentCar.fuel_type,
        transmission ?? rentCar.transmission,
        city ?? rentCar.city,
        motor ?? rentCar.motor,
        customs === undefined ? rentCar.customs : customs === "true" || customs === true,
        drivesystem ?? rentCar.drivesystem,
        color ?? rentCar.color,
        seats ?? rentCar.seats,
        with_driver === undefined ? rentCar.with_driver : with_driver === "true" || with_driver === true,
        allowed_countries === "" ? null : allowed_countries ?? rentCar.allowed_countries,
        available_from === "" ? null : available_from ?? rentCar.available_from,
        available_to === "" ? null : available_to ?? rentCar.available_to,
        id,
      ]
    );

    const imagesToDeleteList = parseImagesToDelete(imagesToDelete);

    for (const imageUrl of imagesToDeleteList) {
      const imageResult = await client.query(
        "SELECT image_url FROM rent_car_images WHERE rent_car_id=$1 AND image_url=$2",
        [id, imageUrl]
      );

      if (imageResult.rows.length === 0) {
        continue;
      }

      const publicId = getCloudinaryPublicId(imageUrl);

      if (publicId) {
        await cloudinary.uploader.destroy(publicId);
      }

      await client.query(
        "DELETE FROM rent_car_images WHERE rent_car_id=$1 AND image_url=$2",
        [id, imageUrl]
      );
    }

    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map((file) =>
        cloudinary.uploader.upload(file.path)
      );
      const results = await Promise.all(uploadPromises);

      for (const result of results) {
        await client.query(
          "INSERT INTO rent_car_images (rent_car_id, image_url) VALUES ($1, $2)",
          [id, result.secure_url]
        );
      }
    }

    await client.query("COMMIT");

    res.json(updated.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    logError("PUT /api/rent-cars/:id", err);
    res.status(500).json({
      message: "Error updating rent car",
      error: err.message,
    });
  } finally {
    client.release();
  }
};

export const deleteRentCar = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query("BEGIN");

    const result = await client.query("SELECT * FROM rent_cars WHERE id=$1", [id]);
    const rentCar = result.rows[0];

    if (!rentCar) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Rent car not found" });
    }

    if (rentCar.user_id !== req.user.id) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Not authorized" });
    }

    const imagesResult = await client.query(
      "SELECT image_url FROM rent_car_images WHERE rent_car_id=$1",
      [id]
    );

    for (const image of imagesResult.rows) {
      const publicId = getCloudinaryPublicId(image.image_url);

      if (publicId) {
        await cloudinary.uploader.destroy(publicId);
      }
    }

    await client.query("DELETE FROM promoted_rent_cars WHERE rent_car_id=$1", [id]);
    await client.query("DELETE FROM rent_car_images WHERE rent_car_id=$1", [id]);
    await client.query("DELETE FROM rent_cars WHERE id=$1", [id]);

    await client.query("COMMIT");

    res.json({ message: "Rent car deleted" });
  } catch (err) {
    await client.query("ROLLBACK");
    logError("DELETE /api/rent-cars/:id", err);
    res.status(500).json({
      message: "Error deleting rent car",
      error: err.message,
    });
  } finally {
    client.release();
  }
};

export const getUnavailableDates = async (req, res) => {
  try {
    const { id } = req.params;

    const rentCarResult = await pool.query(
      "SELECT id, user_id FROM rent_cars WHERE id=$1",
      [id]
    );
    const rentCar = rentCarResult.rows[0];

    if (!rentCar) {
      return res.status(404).json({ message: "Rent car not found" });
    }

    if (rentCar.user_id !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const result = await pool.query(
      `SELECT id, rent_car_id, unavailable_from, unavailable_to, reason, created_at
       FROM rent_car_unavailable_dates
       WHERE rent_car_id=$1
       ORDER BY unavailable_from ASC`,
      [id]
    );

    res.json(result.rows);
  } catch (err) {
    logError("GET /api/rent-cars/:id/unavailable-dates", err);
    res.status(500).json({
      message: "Error fetching unavailable dates",
      error: err.message,
    });
  }
};

export const createUnavailableDate = async (req, res) => {
  try {
    const { id } = req.params;
    const { unavailable_from, unavailable_to, reason } = req.body;

    if (!unavailable_from || !unavailable_to) {
      return res.status(400).json({
        message: "unavailable_from and unavailable_to are required",
      });
    }

    if (new Date(unavailable_from) > new Date(unavailable_to)) {
      return res.status(400).json({
        message: "unavailable_to must be after unavailable_from",
      });
    }

    const rentCarResult = await pool.query(
      "SELECT id, user_id FROM rent_cars WHERE id=$1",
      [id]
    );
    const rentCar = rentCarResult.rows[0];

    if (!rentCar) {
      return res.status(404).json({ message: "Rent car not found" });
    }

    if (rentCar.user_id !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const result = await pool.query(
      `INSERT INTO rent_car_unavailable_dates
       (rent_car_id, unavailable_from, unavailable_to, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING id, rent_car_id, unavailable_from, unavailable_to, reason, created_at`,
      [id, unavailable_from, unavailable_to, reason || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    logError("POST /api/rent-cars/:id/unavailable-dates", err);
    res.status(500).json({
      message: "Error creating unavailable dates",
      error: err.message,
    });
  }
};

export const deleteUnavailableDate = async (req, res) => {
  try {
    const { id, blockId } = req.params;

    const rentCarResult = await pool.query(
      "SELECT id, user_id FROM rent_cars WHERE id=$1",
      [id]
    );
    const rentCar = rentCarResult.rows[0];

    if (!rentCar) {
      return res.status(404).json({ message: "Rent car not found" });
    }

    if (rentCar.user_id !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const result = await pool.query(
      `DELETE FROM rent_car_unavailable_dates
       WHERE id=$1 AND rent_car_id=$2
       RETURNING id`,
      [blockId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Unavailable date not found" });
    }

    res.json({ message: "Unavailable dates deleted" });
  } catch (err) {
    logError("DELETE /api/rent-cars/:id/unavailable-dates/:blockId", err);
    res.status(500).json({
      message: "Error deleting unavailable dates",
      error: err.message,
    });
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
