import { Client, Databases, Query } from "node-appwrite";

export default async ({ req, res, log, error }) => {
  try {
    const { token, deviceId } = JSON.parse(req.body || "{}");

    if (!token) {
      return res.json({ valid: false, reason: "no_token" });
    }

    const client = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY); // server key

    const db = new Databases(client);

    const result = await db.listDocuments(
      process.env.DB_ID,
      process.env.COLLECTION_ID,
      [Query.equal("token", token)]
    );

    if (result.total === 0) {
      return res.json({ valid: false, reason: "not_found" });
    }

    const license = result.documents[0];

    // check active
    if (!license.isActive) {
      return res.json({ valid: false, reason: "inactive" });
    }

    // check expiry
    if (Date.now() > license.expiredAt) {
      return res.json({ valid: false, reason: "expired" });
    }

    // bind device
    if (!license.deviceId && deviceId) {
      await db.updateDocument(
        process.env.DB_ID,
        process.env.COLLECTION_ID,
        license.$id,
        { deviceId }
      );
    } else if (
      license.deviceId &&
      deviceId &&
      license.deviceId !== deviceId
    ) {
      return res.json({ valid: false, reason: "device_mismatch" });
    }

    return res.json({
      valid: true,
      expiredAt: license.expiredAt
    });

  } catch (err) {
    return res.json({ valid: false, error: err.message });
  }
};