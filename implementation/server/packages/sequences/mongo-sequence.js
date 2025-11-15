import { database } from 'databases/mongodb.js';

const collection = database.collection('sequences');

export {
    next
};

async function next({ sequenceName }) {
    if (typeof sequenceName !== "string" || sequenceName.length === 0) {
      throw new Error("sequenceName must be a non-empty string");
    }

    const result = await collection.findOneAndUpdate(
      { _id: sequenceName },
      {
        $inc: { value: 1 },
      },
      {
        upsert: true,
        returnDocument: "after",
      }
    );

    if (!result.value || typeof result.value !== "number") {
      throw new Error("Failed to generate sequence value");
    }

    return result.value;
}