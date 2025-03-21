require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();
const port = process.env.PORT || 5000;

//middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://medical-camp-bb0ac.web.app",
      "https://medical-camp-bb0ac.firebaseapp.com",
    ],
    credentials: true,
    optionSuccessStatus: 200,
  })
);
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wf6wg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    const userCollection = client.db("medicalCampDB").collection("users");
    const organizerCollection = client
      .db("medicalCampDB")
      .collection("organizers");
    const campCollection = client.db("medicalCampDB").collection("camps");
    const registerCampCollection = client
      .db("medicalCampDB")
      .collection("registerCamps");
    const pastCampCollection = client
      .db("medicalCampDB")
      .collection("pastCamps");
    const reviewCollection = client.db("medicalCampDB").collection("reviews");
    const paymentCollection = client.db("medicalCampDB").collection("payments");

    // Generate jwt token
    app.post("/jwt", async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "7d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });
    // Logout
    app.get("/logout", async (req, res) => {
      try {
        res
          .clearCookie("token", {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
      } catch (err) {
        res.status(500).send(err);
      }
    });

    // middleWare
    const verifyToken = (req, res, next) => {
      const token = req.cookies?.token;
      console.log(token);
      if (!token) {
        return res.status(401).send({ message: "Unauthorized access" });
      }
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorize message" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await organizerCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };

    // organizer related api
    app.get("/organizers/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const query = { email: email };
      const user = await organizerCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    // user related api
    app.get("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    app.patch("/users/:id", verifyToken, async (req, res) => {
      const user = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          name: user.name,
          email: user.email,
          image: user.image,
          phone: user.phone,
        },
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;

      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // camps related api
    app.get("/camps", async (req, res) => {
      const limit = parseInt(req.query.limit) || 0;
      const sortBy = req.query?.sortBy;
      const search = req.query?.search;

      let query = {};

      // search by name, location
      if (search) {
        query = {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { location: { $regex: search, $options: "i" } },
          ],
        };
      }

      // sort
      const sort = {};
      if (sortBy === "participantCount") {
        sort.participantCount = -1;
      } else if (sortBy === "fees") {
        sort.fees = -1;
      } else if (sortBy === "name") {
        sort.name = 1;
      }

      let result;

      if (limit > 0) {
        result = campCollection
          .find(query)
          .sort({ participantCount: -1 })
          .limit(limit);
      } else {
        result = campCollection.find(query).sort(sort);
      }

      const campsResult = await result.toArray();
      res.send(campsResult);
    });

    app.get("/camps/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await campCollection.findOne(query);
      res.send(result);
    });

    app.post("/camps", verifyToken, verifyAdmin, async (req, res) => {
      const camp = req.body;
      const result = await campCollection.insertOne(camp);
      res.send(result);
    });

    app.patch("/camps/:campId", verifyToken, verifyAdmin, async (req, res) => {
      const camp = req.body;
      const id = req.params.campId;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          name: camp.name,
          image: camp.image,
          fees: camp.fees,
          dateTime: camp.dateTime,
          location: camp.location,
          healthCareProfessional: camp.healthCareProfessional,
          participantCount: camp.participantCount,
          description: camp.description,
        },
      };
      const result = await campCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.delete("/camps/:campId", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.campId;
      const query = { _id: new ObjectId(id) };
      const result = await campCollection.deleteOne(query);
      res.send(result);
    });

    // past camps
    app.get("/past-camps", async (req, res) => {
      const result = await pastCampCollection.find().toArray();
      res.send(result);
    });

    //register camps
    app.get("/registered-camps", async (req, res) => {
      const result = await registerCampCollection.find().toArray();
      res.send(result);
    });

    app.get("/registered-camps/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const query = { participantEmail: email };
      const result = await registerCampCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/registered-camps", verifyToken, async (req, res) => {
      const register = req.body;
      const result = await registerCampCollection.insertOne(register);

      const updatedCamp = await campCollection.findOneAndUpdate(
        { _id: new ObjectId(register.campId) },
        { $inc: { participantCount: 1 } }
      );

      res.send(result);
    });

    app.patch("/registered-camps/:id", async (req, res) => {
      const id = req.params.id;
      const confirmStatus = req.body.confirmStatus;

      const filter = { _id: new ObjectId(id) };
      const updateCamp = {
        $set: { confirmStatus },
      };
      const result = await registerCampCollection.updateOne(filter, updateCamp);
      const paymentResult = await paymentCollection.updateOne(
        { registerId: id },
        updateCamp
      );
      res.send({ result, paymentResult });
    });

    app.delete("/registered-camps/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await registerCampCollection.deleteOne(query);
      res.send(result);
    });

    // reviews api
    app.get("/reviews", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    app.post("/reviews", async (req, res) => {
      const reviews = req.body;
      const result = await reviewCollection.insertOne(reviews);
      res.send(result);
    });

    // payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { fees } = req.body;
      const amount = parseInt(fees * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.get("/payments/:email", verifyToken, async (req, res) => {
      const query = { email: req.params.email };
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      const updateResult = await registerCampCollection.updateOne(
        { _id: new ObjectId(payment.registerId) },
        {
          $set: {
            paymentStatus: "Paid",
          },
        }
      );

      res.send({ paymentResult, updateResult });
    });

    // participant stat
    app.get("/participant-stat/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      try {
        const totalRegisteredCamps =
          await registerCampCollection.countDocuments({
            participantEmail: email,
          });

        const totalPaymentNum = await paymentCollection.countDocuments({
          email: email,
        });

        const totalFees = await paymentCollection
          .aggregate([
            { $match: { email: email } },
            { $group: { _id: null, total: { $sum: "$fees" } } },
          ])
          .next();

        const totalFeesAmount = totalFees ? totalFees.total : 0;

        // Aggregate payment data and lookup matching camp data by day, month, and year
        const chartData = await paymentCollection
          .aggregate([
            { $match: { email: email } },
            {
              $project: {
                day: { $dayOfMonth: { $toDate: "$_id" } },
                month: { $month: { $toDate: "$_id" } },
                year: { $year: { $toDate: "$_id" } },
                fees: 1,
              },
            },
            {
              $group: {
                _id: { day: "$day", month: "$month", year: "$year" },
                totalFees: { $sum: "$fees" },
                numberOfPayments: { $sum: 1 },
              },
            },
            {
              $lookup: {
                from: "registerCampCollection",
                let: {
                  day: "$_id.day",
                  month: "$_id.month",
                  year: "$_id.year",
                },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          {
                            $eq: [
                              { $dayOfMonth: { $toDate: "$_id" } },
                              "$$day",
                            ],
                          },
                          { $eq: [{ $month: { $toDate: "$_id" } }, "$$month"] },
                          { $eq: [{ $year: { $toDate: "$_id" } }, "$$year"] },
                        ],
                      },
                    },
                  },
                  {
                    $group: {
                      _id: null,
                      totalCamps: { $sum: 1 },
                    },
                  },
                ],
                as: "campData",
              },
            },
            {
              $unwind: {
                path: "$campData",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $addFields: {
                totalCamps: { $ifNull: ["$campData.totalCamps", 0] },
              },
            },
            {
              $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
            },
            {
              $project: {
                date: {
                  $concat: [
                    { $toString: "$_id.day" },
                    "/",
                    { $toString: "$_id.month" },
                    "/",
                    { $toString: "$_id.year" },
                  ],
                },
                totalFees: 1,
                totalCamps: 1,
                numberOfPayments: 1,
              },
            },
          ])
          .toArray();

        res.send({
          totalPayment: totalFeesAmount,
          totalRegisteredCamps,
          totalPaymentNum,
          chartData,
        });
      } catch (error) {
        console.error("Error fetching participant stats:", error.message);
        res.status(500).send({
          error: "Internal Server Error",
          message: error.message || "An unexpected error occurred.",
        });
      }
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
