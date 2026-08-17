export const requireAdminPage = (req, res, next) => {
  if (!req.session?.adminId) {
    return res.redirect('/admin/login');
  }
  res.locals.adminName = req.session.adminName || 'Admin';
  next();
};

export const redirectIfAdminLoggedIn = (req, res, next) => {
  if (req.session?.adminId) {
    return res.redirect('/admin');
  }
  next();
};
