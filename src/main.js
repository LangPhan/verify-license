import { Client, Databases, Query } from "node-appwrite";

export default async ({ req, res, log, error }) => {
  try {
    // 1. XỬ LÝ REQ.BODY AN TOÀN
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
        // Nếu req.body đã là object (do Appwrite tự parse)
        payload = req.body;
      }
    }

    const { token, deviceId } = payload;

    // 2. KIỂM TRA ĐẦU VÀO
    if (!token) {
      return res.json({ valid: false, reason: "no_token" });
    }

    // 3. KHỞI TẠO APPWRITE
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY); // server key

    const db = new Databases(client);

    // 4. TRUY VẤN DATABASE
    const result = await db.listDocuments(
      process.env.DB_ID,
      process.env.COLLECTION_ID,
      [Query.equal("token", token)]
    );

    if (result.total === 0) {
      return res.json({ valid: false, reason: "not_found" });
    }

    const license = result.documents[0];

    // 5. KIỂM TRA ĐIỀU KIỆN LICENSE
    // check active
    if (!license.isActive) {
      return res.json({ valid: false, reason: "inactive" });
    }

    // check expiry
    if (license.expiredAt && Date.now() > new Date(license.expiredAt).getTime()) {
      return res.json({ valid: false, reason: "expired" });
    }

    // 6. XỬ LÝ BINDING DEVICE
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

    // 7. TRẢ VỀ KẾT QUẢ THÀNH CÔNG
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