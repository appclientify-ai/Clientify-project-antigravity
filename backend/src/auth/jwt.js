import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'clientify-secret-key-change-in-production';
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn('⚠️ WARNING: JWT_SECRET environment variable is not defined in production environment.');
}

export const generateToken = (user) => {
  const userId = user._id ? user._id.toString() : user.id;
  return jwt.sign(
    { 
      id: userId, 
      email: user.email_id || user.email, 
      username: user.username 
    }, 
    SECRET, 
    { expiresIn: '7d' }
  );
};

export const verifyToken = (token) => {
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET);
  } catch (err) {
    return null;
  }
};
