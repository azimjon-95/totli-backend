import mongoose, { Schema } from 'mongoose';

const settingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const SettingsModel = mongoose.model('Settings', settingsSchema);

export async function getSetting<T>(key: string): Promise<T | null> {
  const doc = await SettingsModel.findOne({ key }).lean();
  return (doc?.value as T) ?? null;
}

export async function setSetting(key: string, value: unknown) {
  await SettingsModel.findOneAndUpdate(
    { key },
    { $set: { value } },
    { upsert: true, new: true }
  );
}
