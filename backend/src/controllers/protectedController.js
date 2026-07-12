exports.dashboard = async (req, res) => {
  return res.json({
    message: 'Protected route working',
    user: req.user,
  });
};