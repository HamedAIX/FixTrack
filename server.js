const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI;

async function startServer() {
  try {
    await createDefaultAdmin();

    const server = app.listen(PORT, () => {
      console.log(`\n Server running on http://localhost:${PORT}`);
    });

    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`Error: Port ${PORT} is already in use!`);
        console.error(
          "Please run: killall node   # to stop all node processes",
        );
        process.exit(1);
      }
      throw error;
    });
  } catch (error) {
    console.error("Failed to start server:", error);
  }
}

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✓ Connected to MongoDB");
    startServer();
  })
  .catch((err) => console.error("✗ MongoDB Connection Error:", err));

const orderSchema = new mongoose.Schema(
  {
    _id: String,
    customerName: String,
    customerPhone: String,
    serviceType: String,
    price: Number,
    status: {
      type: String,
      default: "waiting",
      enum: ["waiting", "ready", "failed"],
    },
    description: String,
    failureReason: String,
    technician: String,
    scheduledTime: {
      hours: Number,
      minutes: Number,
    },
  },
  { timestamps: true },
);

const technicianSchema = new mongoose.Schema(
  {
    name: String,
    phone: String,
    specialty: String,
    status: {
      type: String,
      default: "available",
      enum: ["available", "busy", "leave"],
    },
  },
  { timestamps: true },
);

const adminSchema = new mongoose.Schema(
  {
    email: String,
    password: String,
    name: String,
    phone: String,
    role: { type: String, default: "admin" },
    lastLogin: Date,
  },
  { timestamps: true },
);

const Order = mongoose.model("Order", orderSchema);
const Technician = mongoose.model("Technician", technicianSchema);
const Admin = mongoose.model("Admin", adminSchema);

const findAdminRecord = async ({ adminId, email } = {}) => {
  if (adminId && mongoose.Types.ObjectId.isValid(adminId)) {
    const adminById = await Admin.findById(adminId);
    if (adminById) {
      return adminById;
    }
  }

  if (email) {
    const adminByEmail = await Admin.findOne({ email });
    if (adminByEmail) {
      return adminByEmail;
    }
  }

  const adminByRole = await Admin.findOne({ role: "admin" }).sort({
    createdAt: 1,
  });
  if (adminByRole) {
    return adminByRole;
  }

  return Admin.findOne().sort({ createdAt: 1 });
};

async function createDefaultAdmin() {
  try {
    const adminExists = await findAdminRecord();
    if (!adminExists) {
      const defaultAdmin = new Admin({
        email: "admin@fixtrack.com",
        password: "admin123",
        name: "حامد العريقي",
        phone: "770737621",
        role: "admin",
      });
      await defaultAdmin.save();
      console.log("✓ Default admin created successfully");
      console.log("  Email: admin@fixtrack.com");
      return true;
    } else {
      console.log("✓ Admin already exists");
      return false;
    }
  } catch (error) {
    console.error("✗ Error creating admin:", error.message);
    return false;
  }
}

app.get("/api/orders", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/orders/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/orders", async (req, res) => {
  try {
    // رقم الطلب يُبنى من آخر أرقام الهاتف مع جزء زمني لتقليل تكراره.
    const phoneDigits = req.body.customerPhone.replace(/\D/g, "").slice(-7);
    const timestamp = Date.now().toString().slice(-3);
    const random = Math.floor(Math.random() * 100)
      .toString()
      .padStart(2, "0");
    const orderId = (phoneDigits + timestamp + random).slice(-10);

    const order = new Order({ ...req.body, _id: orderId });
    await order.save();
    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/orders/:id", async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true },
    );
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/orders/:id", async (req, res) => {
  try {
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: "Order deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/orders-stats", async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const waitingOrders = await Order.countDocuments({ status: "waiting" });
    const readyOrders = await Order.countDocuments({ status: "ready" });
    const failedOrders = await Order.countDocuments({ status: "failed" });

    const orders = await Order.find();
    const completedRevenue = orders
      .filter((o) => o.status === "ready")
      .reduce((sum, o) => sum + (o.price || 0), 0);
    const pendingRevenue = orders
      .filter((o) => o.status === "waiting")
      .reduce((sum, o) => sum + (o.price || 0), 0);

    res.json({
      totalOrders,
      waitingOrders,
      readyOrders,
      failedOrders,
      completedRevenue,
      pendingRevenue,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/technicians", async (req, res) => {
  try {
    const technicians = await Technician.find();
    res.json(technicians);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/technicians", async (req, res) => {
  try {
    const tech = new Technician(req.body);
    await tech.save();
    res.status(201).json(tech);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/technicians/:id", async (req, res) => {
  try {
    const tech = await Technician.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true },
    );
    res.json(tech);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/technicians/:id", async (req, res) => {
  try {
    await Technician.findByIdAndDelete(req.params.id);
    res.json({ message: "Technician deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/profile", async (req, res) => {
  try {
    const admin = await findAdminRecord({
      adminId: req.query.adminId,
      email: req.query.email,
    });
    if (!admin) {
      return res.status(404).json({
        success: false,
        error: "Admin not found. Please contact support.",
      });
    }
    res.json(admin);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email, password });

    if (admin) {
      admin.lastLogin = new Date();
      await admin.save();
      res.json({ success: true, admin });
    } else {
      res.status(401).json({ success: false, error: "Invalid credentials" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/admin/password", async (req, res) => {
  try {
    const { currentPassword, newPassword, email, adminId } = req.body;
    const admin = await findAdminRecord({ adminId, email });

    if (!admin) {
      return res.status(404).json({
        success: false,
        error: "Admin not found. Please contact support.",
      });
    }

    if (admin.password === currentPassword) {
      admin.password = newPassword;
      await admin.save();
      res.json({ success: true, message: "Password updated successfully" });
    } else {
      res
        .status(400)
        .json({ success: false, error: "Current password is incorrect" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/admin/profile", async (req, res) => {
  try {
    const { name, email, phone, currentEmail, adminId } = req.body;
    const admin = await findAdminRecord({ adminId, email: currentEmail });

    if (admin) {
      admin.name = name;
      admin.email = email;
      admin.phone = phone;
      await admin.save();
      res.json(admin);
    } else {
      res
        .status(404)
        .json({ error: "Admin not found. Please contact support." });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
