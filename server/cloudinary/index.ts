/**
 * EarnHub BD V20 — Cloudinary Media Storage Service
 * Handles secure media uploads, signed presets, and CDN optimizations
 */

import { v2 as cloudinary } from 'cloudinary';
import { getStore } from '../db';

export function configureCloudinary() {
  const store = getStore();
  const settings = store.cloudinarySettings;

  if (settings && settings.cloudName && settings.apiKey && settings.apiSecret) {
    cloudinary.config({
      cloud_name: settings.cloudName,
      api_key: settings.apiKey,
      api_secret: settings.apiSecret,
      secure: true,
    });
    return true;
  }

  const envCloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const envApiKey = process.env.CLOUDINARY_API_KEY;
  const envApiSecret = process.env.CLOUDINARY_API_SECRET;

  if (envCloudName && envApiKey && envApiSecret) {
    cloudinary.config({
      cloud_name: envCloudName,
      api_key: envApiKey,
      api_secret: envApiSecret,
      secure: true,
    });
    return true;
  }

  return false;
}

export async function uploadToCloudinary(fileBufferOrPath: string, folder = 'earnhub'): Promise<{ url: string; publicId: string } | null> {
  const isConfigured = configureCloudinary();
  if (!isConfigured) {
    console.warn('[Cloudinary] Cloudinary credentials not configured.');
    return null;
  }

  try {
    const result = await cloudinary.uploader.upload(fileBufferOrPath, {
      folder,
      resource_type: 'auto',
    });
    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    console.error('[Cloudinary] Upload failed:', error);
    throw error;
  }
}
