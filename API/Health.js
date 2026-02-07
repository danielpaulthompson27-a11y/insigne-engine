export default function handler(req, res) {
  res.status(200).json({
    status: "ok",
    service: "insigne-engine",
    time: new Date().toISOString()
  });
}
