export const loggedInOnly = (req, res, next) => {
  if (req.isAuthenticated()) next();
  else res.status(401).json('You must be logged in');
};

export const loggedOutOnly = (req, res, next) => {
  if (req.isUnauthenticated()) next();
  else res.status(403).json('You must be logged out');
};

export const adminOnly = (req, res, next) => {
  if (req.user.type === 'admin') next();
  else res.status(403).json('You must be an administrator');
};

export const clientOnly = (req, res, next) => {
  if (req.user.type === 'client') next();
  else res.status(403).json('You must be a client');
};
