import { MongoClient, type Db } from "mongodb";

let clientPromise: Promise<MongoClient> | undefined;

function getMongoUri() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required for vault history.");
  }
  return uri;
}

export async function getMongoDb(): Promise<Db> {
  if (!clientPromise) {
    const client = new MongoClient(getMongoUri(), {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });
    clientPromise = client.connect();
  }

  const client = await clientPromise;
  return client.db(process.env.DB_NAME || "AARYAN");
}