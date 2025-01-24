require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());

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
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    const userCollection = client.db("medicalCampDB").collection("users");
    const campCollection = client.db("medicalCampDB").collection("camps");

    // user related api
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // camps related api
    app.get("/camps", async (req, res) => {
      const limit = parseInt(req.query.limit) || 0;
      const sortBy = req.query.sortBy || "participantCount";

      let query = campCollection.find();

      // sort
      const sort = {};
      if (sortBy === "participantCount") {
        sort.participantCount = -1;
      } else if (sortBy === "fees") {
        sort.fees = -1;
      } else if (sortBy === "name") {
        sort.name = 1;
      }

      query = query.sort(sort);

      if (limit > 0) {
        query = query.sort({ participantCount: -1 }).limit(limit);
      }

      const result = await query.toArray();
      res.send(result);
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
