import mongoose from "mongoose";
import { getMongoUri } from "@/config/env";
import { DocumentModel } from "@/models/Document";
import { TranscriptionModel } from "@/models/Transcription";

// Cached on `global` so Next.js dev hot-reload doesn't open a new connection per file edit.
declare global {
  var __garranchogenMongooseConn: Promise<typeof mongoose> | undefined;
  var __garranchogenIndexesSynced: boolean | undefined;
}

export function connectToDatabase(): Promise<typeof mongoose> {
  if (!global.__garranchogenMongooseConn) {
    global.__garranchogenMongooseConn = mongoose
      .connect(getMongoUri(), { serverSelectionTimeoutMS: 5000 })
      .then(async (conn) => {
        if (!global.__garranchogenIndexesSynced) {
          await Promise.all([DocumentModel.syncIndexes(), TranscriptionModel.syncIndexes()]);
          global.__garranchogenIndexesSynced = true;
        }
        return conn;
      })
      .catch((error: unknown) => {
        global.__garranchogenMongooseConn = undefined;
        throw error;
      });
  }
  return global.__garranchogenMongooseConn;
}

export async function pingDatabase(): Promise<boolean> {
  try {
    const conn = await connectToDatabase();
    await conn.connection.db?.admin().ping();
    return true;
  } catch {
    return false;
  }
}
