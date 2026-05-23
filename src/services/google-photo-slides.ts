import { Readable } from "node:stream";

import { google, type Auth, type drive_v3, type slides_v1 } from "googleapis";

import type { SlackThreadPhoto } from "./slack-thread-photos.js";
import { env } from "../utils/env.js";

const GENERATED_OBJECT_PREFIX = "weekly_photo_";
const EMU = "EMU";

type GoogleClients = {
  drive: drive_v3.Drive;
  slides: slides_v1.Slides;
};

type UploadedDriveImage = {
  fileId: string;
  publicUrl: string;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const getGoogleClients = (): GoogleClients => {
  const auth = getGoogleAuthClient();

  return {
    drive: google.drive({ version: "v3", auth }),
    slides: google.slides({ version: "v1", auth })
  };
};

const getGoogleAuthClient = (): Auth.GoogleAuth | Auth.OAuth2Client => {
  const scopes = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/presentations"
  ];

  if (env.GOOGLE_AUTH_MODE === "oauth") {
    const oauthClient = new google.auth.OAuth2(
      env.GOOGLE_OAUTH_CLIENT_ID,
      env.GOOGLE_OAUTH_CLIENT_SECRET,
      env.GOOGLE_OAUTH_REDIRECT_URI
    );

    oauthClient.setCredentials({
      refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN
    });

    return oauthClient;
  }

  return new google.auth.GoogleAuth({
    keyFile: env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
    scopes
  });
};

const uploadDriveImage = async (drive: drive_v3.Drive, photo: SlackThreadPhoto): Promise<UploadedDriveImage> => {
  const created = await drive.files.create({
    requestBody: {
      name: `weekly-photo-${photo.fileId}-${photo.name}`,
      parents: [env.GOOGLE_DRIVE_UPLOAD_FOLDER_ID]
    },
    media: {
      mimeType: photo.mimeType,
      body: Readable.from(photo.data)
    },
    fields: "id",
    supportsAllDrives: true
  });

  const fileId = created.data.id;

  if (!fileId) {
    throw new Error(`Google Drive did not return a file ID for ${photo.name}.`);
  }

  await drive.permissions.create({
    fileId,
    requestBody: {
      type: "anyone",
      role: "reader",
      allowFileDiscovery: false
    },
    supportsAllDrives: true
  });

  return {
    fileId,
    publicUrl: `https://drive.google.com/uc?export=view&id=${fileId}`
  };
};

const deleteDriveImages = async (drive: drive_v3.Drive, images: UploadedDriveImage[]): Promise<void> => {
  await Promise.allSettled(
    images.map((image) =>
      drive.files.delete({
        fileId: image.fileId,
        supportsAllDrives: true
      })
    )
  );
};

const getPresentation = async (
  slides: slides_v1.Slides,
  presentationId: string
): Promise<slides_v1.Schema$Presentation> => {
  const result = await slides.presentations.get({
    presentationId
  });

  return result.data;
};

const getSlide = (
  presentation: slides_v1.Schema$Presentation,
  slideNumber: number
): slides_v1.Schema$Page => {
  const slide = presentation.slides?.[slideNumber - 1];

  if (!slide?.objectId) {
    throw new Error(`Slide ${slideNumber} does not exist in the configured presentation.`);
  }

  return slide;
};

const getPageSize = (presentation: slides_v1.Schema$Presentation): { width: number; height: number } => {
  const width = presentation.pageSize?.width?.magnitude;
  const height = presentation.pageSize?.height?.magnitude;

  if (!width || !height) {
    throw new Error("Could not read Google Slides page size.");
  }

  return { width, height };
};

const getGeneratedElementIds = (slide: slides_v1.Schema$Page): string[] => {
  return (slide.pageElements ?? [])
    .map((element) => element.objectId)
    .filter((objectId): objectId is string => Boolean(objectId?.startsWith(GENERATED_OBJECT_PREFIX)));
};

const chooseGrid = (count: number, width: number, height: number): { rows: number; columns: number } => {
  const columns = Math.ceil(Math.sqrt(count * (width / height)));
  const rows = Math.ceil(count / columns);

  return { rows, columns };
};

const getPhotoRects = (count: number, width: number, height: number): Rect[] => {
  const margin = Math.min(width, height) * 0.06;
  const gap = Math.min(width, height) * 0.025;
  const usableWidth = width - margin * 2;
  const usableHeight = height - margin * 2;
  const { rows, columns } = chooseGrid(count, usableWidth, usableHeight);
  const cellWidth = (usableWidth - gap * (columns - 1)) / columns;
  const cellHeight = (usableHeight - gap * (rows - 1)) / rows;

  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;

    return {
      x: margin + column * (cellWidth + gap),
      y: margin + row * (cellHeight + gap),
      width: cellWidth,
      height: cellHeight
    };
  });
};

const createImageRequest = (
  slideId: string,
  image: UploadedDriveImage,
  rect: Rect,
  index: number,
  runId: string
): slides_v1.Schema$Request => {
  return {
    createImage: {
      objectId: `${GENERATED_OBJECT_PREFIX}${runId}_${String(index + 1).padStart(3, "0")}`,
      url: image.publicUrl,
      elementProperties: {
        pageObjectId: slideId,
        size: {
          width: { magnitude: rect.width, unit: EMU },
          height: { magnitude: rect.height, unit: EMU }
        },
        transform: {
          scaleX: 1,
          scaleY: 1,
          translateX: rect.x,
          translateY: rect.y,
          unit: EMU
        }
      }
    }
  };
};

export const populateWeeklyPhotoSlide = async ({
  photos,
  presentationId,
  slideNumber
}: {
  photos: SlackThreadPhoto[];
  presentationId: string;
  slideNumber: number;
}): Promise<{ slideNumber: number; insertedCount: number }> => {
  if (photos.length === 0) {
    throw new Error("No photos were provided to Google Slides.");
  }

  const { drive, slides } = getGoogleClients();
  const presentation = await getPresentation(slides, presentationId);
  const slide = getSlide(presentation, slideNumber);
  const pageSize = getPageSize(presentation);
  const existingGeneratedIds = getGeneratedElementIds(slide);
  const uploadedImages: UploadedDriveImage[] = [];

  try {
    for (const photo of photos) {
      uploadedImages.push(await uploadDriveImage(drive, photo));
    }

    const rects = getPhotoRects(uploadedImages.length, pageSize.width, pageSize.height);
    const runId = Date.now().toString(36);
    const requests: slides_v1.Schema$Request[] = [
      ...existingGeneratedIds.map((objectId) => ({ deleteObject: { objectId } })),
      ...uploadedImages.map((image, index) =>
        createImageRequest(slide.objectId as string, image, rects[index], index, runId)
      )
    ];

    await slides.presentations.batchUpdate({
      presentationId,
      requestBody: { requests }
    });

    return {
      slideNumber,
      insertedCount: uploadedImages.length
    };
  } finally {
    await deleteDriveImages(drive, uploadedImages);
  }
};
