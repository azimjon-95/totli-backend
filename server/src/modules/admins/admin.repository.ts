import { AdminModel, type AdminDocument } from './admin.model.js';

export const AdminRepository = {
  findByEmail(email: string) {
    return AdminModel.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  },

  findByUsername(username: string) {
    return AdminModel.findOne({ username: username.toLowerCase() }).select('+passwordHash');
  },

  findById(id: string) {
    return AdminModel.findById(id);
  },

  findByLogin(login: string) {
    const q = login.toLowerCase().trim();
    return AdminModel.findOne({
      $or: [{ email: q }, { username: q }],
    }).select('+passwordHash');
  },

  async create(data: {
    name: string;
    username: string;
    email: string;
    passwordHash: string;
    role: string;
  }): Promise<AdminDocument> {
    const admin = await AdminModel.create(data);
    return admin as AdminDocument;
  },

  updateLastLogin(id: string) {
    return AdminModel.findByIdAndUpdate(id, { lastLoginAt: new Date() }, { new: true });
  },
};
