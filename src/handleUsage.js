import { Client, Databases, Query } from "node-appwrite";

export default async ({ req, res, log, error }) => {
  try {
    let payload = {};
    if (req.body) {
      if (typeof req.body === 'string') {
        try {
          payload = JSON.parse(req.body);
        } catch (parseError) {
          log("Lỗi Parse JSON: " + req.body);
          return res.json({ valid: false, error: "Dữ liệu gửi lên không phải là JSON hợp lệ" }, 400);
        }
      } else {
        payload = req.body;
      }
    }

    // Lấy thêm action ("validate" hoặc "decrement")
    const { token, deviceId, action = "validate" } = payload;

    if (!token) {
      return res.json({ valid: false, reason: "no_token" });
    }

    const client = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

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

    // KIỂM TRA ĐIỀU KIỆN LICENSE
    if (!license.isActive) {
      return res.json({ valid: false, reason: "inactive" });
    }

    if (license.expiredAt && Date.now() > new Date(license.expiredAt).getTime()) {
      return res.json({ valid: false, reason: "expired" });
    }

    // XỬ LÝ BINDING DEVICE
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

    // Nếu hết lượt sử dụng
    if ((license.usageLimit || 0) <= 0) {
      return res.json({ valid: false, reason: "limit_reached", usageLimit: 0 });
    }

    // XỬ LÝ ACTION TRỪ USAGE LIMIT
    if (action === "decrement") {
      const newUsageLimit = (license.usageLimit || 1) - 1;

      await db.updateDocument(
        process.env.DB_ID,
        process.env.COLLECTION_ID,
        license.$id,
        { usageLimit: newUsageLimit }
      );

      log(`Token ${token} đã bị trừ 1 limit. Còn lại: ${newUsageLimit}`);
      return res.json({
        valid: true,
        usageLimit: newUsageLimit
      });
    }

    // TRẢ VỀ KẾT QUẢ CHO ACTION "VALIDATE" (Mặc định)
    return res.json({
      valid: true,
      expiredAt: license.expiredAt,
      usageLimit: license.usageLimit || 0
    });

  } catch (err) {
    error("Server Error: " + err.message);
    return res.json({ valid: false, error: "Lỗi máy chủ nội bộ" }, 500);
  }
};
