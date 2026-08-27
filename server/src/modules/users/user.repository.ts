import { UserModel, type UserDocument } from './user.model.js';

export const UserRepository = {
  findByTelegramId(telegramId: number) {
    return UserModel.findOne({ telegramId });
  },

  findById(id: string) {
    return UserModel.findById(id);
  },

  async upsertFromTelegram(data: {
    telegramId: number;
    username?: string;
    firstName?: string;
    lastName?: string;
    photoUrl?: string;
    language?: 'uz' | 'ru' | 'en';
  }): Promise<UserDocument> {
    const user = await UserModel.findOneAndUpdate(
      { telegramId: data.telegramId },
      {
        $set: {
          username: data.username,
          firstName: data.firstName,
          lastName: data.lastName,
          photoUrl: data.photoUrl,
          ...(data.language ? { language: data.language } : {}),
          lastLoginAt: new Date(),
          isActive: true,
        },
        $setOnInsert: {
          telegramId: data.telegramId,
        },
      },
      { upsert: true, new: true, runValidators: true }
    );
    return user as UserDocument;
  },
};
