const IMAGE_TYPE_JPEG = "image/jpeg";
const IMAGE_TYPE_PNG = "image/png";
const THUMBNAIL_MAX_SIDE_PX = 96;
const THUMBNAIL_JPEG_QUALITY = 0.74;
const MAX_EMBEDDED_ARTWORK_BYTES = 3 * 1024 * 1024;

let latinDecoder = null;
try {
  latinDecoder = new TextDecoder("latin1");
} catch {
  latinDecoder = null;
}

const readAscii = (bytes, start, length) => {
  const segment = bytes.slice(start, start + length);
  if (latinDecoder) {
    return latinDecoder.decode(segment);
  }
  let value = "";
  for (let index = 0; index < segment.length; index += 1) {
    value += String.fromCharCode(segment[index]);
  }
  return value;
};

const readSynchsafeInteger = (bytes, offset) =>
  ((bytes[offset] & 0x7f) << 21) |
  ((bytes[offset + 1] & 0x7f) << 14) |
  ((bytes[offset + 2] & 0x7f) << 7) |
  (bytes[offset + 3] & 0x7f);

const readUInt24 = (bytes, offset) =>
  (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];

const detectImageMimeType = (bytes) => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return IMAGE_TYPE_JPEG;
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return IMAGE_TYPE_PNG;
  }
  return "";
};

const findStringTerminator = (bytes, start, encoding) => {
  if (encoding === 1 || encoding === 2) {
    for (let index = start; index + 1 < bytes.length; index += 1) {
      if (bytes[index] === 0 && bytes[index + 1] === 0) {
        return index;
      }
    }
    return bytes.length;
  }

  for (let index = start; index < bytes.length; index += 1) {
    if (bytes[index] === 0) {
      return index;
    }
  }
  return bytes.length;
};

const parseApicFrame = (frameBytes) => {
  if (!frameBytes || frameBytes.length < 4) {
    return null;
  }

  const encoding = frameBytes[0];
  let cursor = 1;
  const mimeEnd = findStringTerminator(frameBytes, cursor, 0);
  if (mimeEnd >= frameBytes.length) {
    return null;
  }

  const parsedMimeType = readAscii(frameBytes, cursor, mimeEnd - cursor)
    .trim()
    .toLowerCase();
  cursor = mimeEnd + 1;

  if (cursor >= frameBytes.length) {
    return null;
  }

  // Picture type byte.
  cursor += 1;
  const descriptionEnd = findStringTerminator(frameBytes, cursor, encoding);
  if (descriptionEnd > frameBytes.length) {
    return null;
  }

  cursor = descriptionEnd + (encoding === 1 || encoding === 2 ? 2 : 1);
  if (cursor >= frameBytes.length) {
    return null;
  }

  const imageBytes = frameBytes.slice(cursor);
  const mimeType =
    parsedMimeType && parsedMimeType !== "-->"
      ? parsedMimeType
      : detectImageMimeType(imageBytes) || IMAGE_TYPE_JPEG;

  return { mimeType, imageBytes };
};

const parsePicFrame = (frameBytes) => {
  if (!frameBytes || frameBytes.length < 7) {
    return null;
  }

  const encoding = frameBytes[0];
  let cursor = 1;
  const imageFormat = readAscii(frameBytes, cursor, 3).toUpperCase();
  cursor += 3;
  cursor += 1; // Picture type.

  const descriptionEnd = findStringTerminator(frameBytes, cursor, encoding);
  cursor = descriptionEnd + (encoding === 1 || encoding === 2 ? 2 : 1);
  if (cursor >= frameBytes.length) {
    return null;
  }

  const imageBytes = frameBytes.slice(cursor);
  const mimeType =
    imageFormat === "PNG"
      ? IMAGE_TYPE_PNG
      : imageFormat === "JPG" || imageFormat === "JPEG"
        ? IMAGE_TYPE_JPEG
        : detectImageMimeType(imageBytes) || IMAGE_TYPE_JPEG;

  return { mimeType, imageBytes };
};

const parseId3Artwork = (bytes) => {
  if (bytes.length < 10 || readAscii(bytes, 0, 3) !== "ID3") {
    return null;
  }

  const majorVersion = bytes[3];
  const tagSize = readSynchsafeInteger(bytes, 6);
  const tagEnd = Math.min(bytes.length, 10 + tagSize);

  if (majorVersion === 2) {
    let cursor = 10;
    while (cursor + 6 <= tagEnd) {
      const frameId = readAscii(bytes, cursor, 3);
      const frameSize = readUInt24(bytes, cursor + 3);
      if (!frameId.trim() || frameSize <= 0) {
        break;
      }

      const frameDataStart = cursor + 6;
      const frameDataEnd = frameDataStart + frameSize;
      if (frameDataEnd > tagEnd) {
        break;
      }

      if (frameId === "PIC") {
        return parsePicFrame(bytes.slice(frameDataStart, frameDataEnd));
      }

      cursor = frameDataEnd;
    }

    return null;
  }

  if (majorVersion !== 3 && majorVersion !== 4) {
    return null;
  }

  let cursor = 10;
  while (cursor + 10 <= tagEnd) {
    const frameId = readAscii(bytes, cursor, 4);
    if (!frameId.trim()) {
      break;
    }

    const frameSize =
      majorVersion === 4
        ? readSynchsafeInteger(bytes, cursor + 4)
        : new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
            cursor + 4,
            false
          );

    if (frameSize <= 0) {
      break;
    }

    const frameDataStart = cursor + 10;
    const frameDataEnd = frameDataStart + frameSize;
    if (frameDataEnd > tagEnd) {
      break;
    }

    if (frameId === "APIC") {
      return parseApicFrame(bytes.slice(frameDataStart, frameDataEnd));
    }

    cursor = frameDataEnd;
  }

  return null;
};

const readAtomSize = (view, offset, maxEnd) => {
  if (offset + 8 > maxEnd) {
    return { size: 0, headerSize: 0 };
  }

  let size = view.getUint32(offset, false);
  let headerSize = 8;

  if (size === 1) {
    if (offset + 16 > maxEnd) {
      return { size: 0, headerSize: 0 };
    }
    const largeSize = view.getBigUint64(offset + 8, false);
    size = Number(largeSize);
    headerSize = 16;
  } else if (size === 0) {
    size = maxEnd - offset;
  }

  if (size < headerSize || offset + size > maxEnd) {
    return { size: 0, headerSize: 0 };
  }

  return { size, headerSize };
};

const parseCovrAtom = (bytes, view, start, end) => {
  let cursor = start;
  while (cursor + 8 <= end) {
    const { size, headerSize } = readAtomSize(view, cursor, end);
    if (!size || !headerSize) {
      break;
    }

    const type = readAscii(bytes, cursor + 4, 4);
    const payloadStart = cursor + headerSize;
    const payloadEnd = cursor + size;

    if (type === "data" && payloadEnd >= payloadStart + 12) {
      const dataType = view.getUint32(payloadStart + 4, false);
      const imageBytes = bytes.slice(payloadStart + 12, payloadEnd);
      if (imageBytes.length > 0) {
        const mimeType =
          dataType === 14
            ? IMAGE_TYPE_PNG
            : dataType === 13
              ? IMAGE_TYPE_JPEG
              : detectImageMimeType(imageBytes) || IMAGE_TYPE_JPEG;

        return { mimeType, imageBytes };
      }
    }

    cursor += size;
  }

  return null;
};

const MP4_CONTAINER_TYPES = new Set([
  "moov",
  "udta",
  "meta",
  "ilst",
  "trak",
  "mdia",
  "minf",
  "stbl",
]);

const parseMp4Artwork = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const walkAtoms = (start, end) => {
    let cursor = start;
    while (cursor + 8 <= end) {
      const { size, headerSize } = readAtomSize(view, cursor, end);
      if (!size || !headerSize) {
        break;
      }

      const type = readAscii(bytes, cursor + 4, 4);
      const contentStart = cursor + headerSize;
      const contentEnd = cursor + size;

      if (type === "covr") {
        const artwork = parseCovrAtom(bytes, view, contentStart, contentEnd);
        if (artwork) {
          return artwork;
        }
      }

      if (MP4_CONTAINER_TYPES.has(type)) {
        const nestedStart =
          type === "meta" && contentStart + 4 <= contentEnd
            ? contentStart + 4
            : contentStart;
        const artwork = walkAtoms(nestedStart, contentEnd);
        if (artwork) {
          return artwork;
        }
      }

      cursor += size;
    }

    return null;
  };

  return walkAtoms(0, bytes.length);
};

const parseFlacArtwork = (bytes) => {
  if (bytes.length < 4 || readAscii(bytes, 0, 4) !== "fLaC") {
    return null;
  }

  let cursor = 4;
  while (cursor + 4 <= bytes.length) {
    const header = bytes[cursor];
    const isLastBlock = (header & 0x80) !== 0;
    const blockType = header & 0x7f;
    const blockLength = readUInt24(bytes, cursor + 1);
    const blockStart = cursor + 4;
    const blockEnd = blockStart + blockLength;

    if (blockEnd > bytes.length) {
      break;
    }

    if (blockType === 6) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let position = blockStart + 4;
      if (position + 4 > blockEnd) {
        return null;
      }
      const mimeLength = view.getUint32(position, false);
      position += 4;
      if (position + mimeLength > blockEnd) {
        return null;
      }
      const mimeType = readAscii(bytes, position, mimeLength).toLowerCase();
      position += mimeLength;
      if (position + 4 > blockEnd) {
        return null;
      }
      const descriptionLength = view.getUint32(position, false);
      position += 4 + descriptionLength;
      if (position + 20 > blockEnd) {
        return null;
      }
      position += 16; // width, height, depth, indexed colors
      const imageLength = view.getUint32(position, false);
      position += 4;
      if (position + imageLength > blockEnd) {
        return null;
      }
      const imageBytes = bytes.slice(position, position + imageLength);
      return {
        mimeType: mimeType || detectImageMimeType(imageBytes) || IMAGE_TYPE_JPEG,
        imageBytes,
      };
    }

    cursor = blockEnd;
    if (isLastBlock) {
      break;
    }
  }

  return null;
};

const fileBytesToDataUrl = (bytes, mimeType) =>
  new Promise((resolve, reject) => {
    const blob = new Blob([bytes], { type: mimeType });
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not build image preview."));
    };
    reader.onerror = () => reject(new Error("Could not build image preview."));
    reader.readAsDataURL(blob);
  });

const optimizeThumbnailDataUrl = (bytes, mimeType) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    const image = new Image();

    image.onload = () => {
      const sourceWidth = image.naturalWidth || image.width || 1;
      const sourceHeight = image.naturalHeight || image.height || 1;
      const maxSide = Math.max(sourceWidth, sourceHeight);
      const scale =
        maxSide > THUMBNAIL_MAX_SIDE_PX ? THUMBNAIL_MAX_SIDE_PX / maxSide : 1;
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");

      URL.revokeObjectURL(objectUrl);

      if (!context) {
        void fileBytesToDataUrl(bytes, mimeType).then(resolve).catch(reject);
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL(IMAGE_TYPE_JPEG, THUMBNAIL_JPEG_QUALITY));
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      void fileBytesToDataUrl(bytes, mimeType).then(resolve).catch(reject);
    };

    image.src = objectUrl;
  });

export const extractEmbeddedArtworkDataUrl = async (file) => {
  if (!file) {
    return "";
  }

  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const lowerName = (file.name || "").toLowerCase();

    let artwork = null;
    if (readAscii(bytes, 0, 3) === "ID3" || lowerName.endsWith(".mp3")) {
      artwork = parseId3Artwork(bytes);
    } else if (readAscii(bytes, 0, 4) === "fLaC" || lowerName.endsWith(".flac")) {
      artwork = parseFlacArtwork(bytes);
    } else if (
      lowerName.endsWith(".m4a") ||
      lowerName.endsWith(".mp4") ||
      lowerName.endsWith(".aac")
    ) {
      artwork = parseMp4Artwork(bytes);
    }

    if (!artwork || !artwork.imageBytes?.length) {
      return "";
    }
    if (artwork.imageBytes.length > MAX_EMBEDDED_ARTWORK_BYTES) {
      return "";
    }

    const mimeType =
      artwork.mimeType && artwork.mimeType.startsWith("image/")
        ? artwork.mimeType
        : detectImageMimeType(artwork.imageBytes) || IMAGE_TYPE_JPEG;

    return await optimizeThumbnailDataUrl(artwork.imageBytes, mimeType);
  } catch {
    return "";
  }
};
