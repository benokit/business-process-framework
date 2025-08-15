// Import dependencies
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bodyParser = require('body-parser');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());

// Connect to MongoDB
const client = new MongoClient('mongodb://admin:password@localhost:27017/admin');
const database = client.db('test-db');
const collection = database.collection('entities');
// CRUD Routes

// Create
app.post('/entities', async (req, res) => {
    try {
        const result = await collection.insertOne(req.body);
        res.status(201).json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Read One
app.get('/entities/:id', async (req, res) => {
    try {
        const entity = await collection.findOne({ _id: new ObjectId(req.params.id) });
        if (!entity) return res.status(404).json({ error: 'Entity not found' });
        res.json(entity);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
