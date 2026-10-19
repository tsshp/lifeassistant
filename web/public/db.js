const emptyData = () => ({
  version: 2,
  trips: [], items: [], purchases: [], receipts: [], stores: [],
  tags: [], priceSightings: [], purchaseTypes: [], drafts: [], recentFilters: [],
  preferences: { columns: 2, sort: "activity", sortDirection: "desc" }
});
function normalizeData(value) {
  const defaults = emptyData();
  const source = value && typeof value === "object" ? value : {};
  return { ...defaults, ...source, preferences: { ...defaults.preferences, ...(source.preferences ?? {}) } };
}
let folderHandle = null;
let data = emptyData();

async function readData() {
  if (!folderHandle) return data;
  try {
    const fileHandle = await folderHandle.getFileHandle("riceball.json");
    data = normalizeData(JSON.parse(await (await fileHandle.getFile()).text()));
  } catch (error) {
    if (error.name !== "NotFoundError") throw error;
    data = emptyData();
    await writeData();
  }
  return data;
}

async function writeData() {
  if (!folderHandle) throw new Error("Choose a Riceball folder before saving");
  const fileHandle = await folderHandle.getFileHandle("riceball.json", { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

async function ensurePermission() {
  if (!folderHandle) return false;
  if ((await folderHandle.queryPermission({ mode: "readwrite" })) === "granted") return true;
  return (await folderHandle.requestPermission({ mode: "readwrite" })) === "granted";
}

export const fileStore = {
  supported: "showDirectoryPicker" in window,
  hasFolder: () => folderHandle !== null,
  chooseFolder: async () => {
    if (!("showDirectoryPicker" in window)) throw new Error("This browser does not support folder access. Use Chrome or Edge on Android/desktop.");
    folderHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    if (!(await ensurePermission())) throw new Error("Read/write permission was not granted for the selected folder");
    await readData();
    return data;
  },
  load: readData,
  save: async (nextData) => { data = nextData; await writeData(); return data; },
  export: () => JSON.stringify(data, null, 2),
  import: async (json) => { data = normalizeData(JSON.parse(json)); await writeData(); return data; },
  backupToFolder: async () => {
    if (!folderHandle) throw new Error("Choose a Riceball folder before backing up");
    if (!("showDirectoryPicker" in window)) throw new Error("This browser does not support folder backups");
    const target = await window.showDirectoryPicker({ mode: "readwrite" });
    const jsonHandle = await target.getFileHandle("riceball.json", { create: true });
    const jsonWriter = await jsonHandle.createWritable();
    await jsonWriter.write(JSON.stringify(data, null, 2));
    await jsonWriter.close();
    const sourcePhotos = await folderHandle.getDirectoryHandle("photos").catch(() => null);
    if (sourcePhotos) {
      const targetPhotos = await target.getDirectoryHandle("photos", { create: true });
      for await (const entry of sourcePhotos.values()) {
        if (entry.kind !== "file") continue;
        const sourceFile = await entry.getFile();
        const targetHandle = await targetPhotos.getFileHandle(entry.name, { create: true });
        const writer = await targetHandle.createWritable();
        await writer.write(await sourceFile.arrayBuffer());
        await writer.close();
      }
    }
  },
  savePhoto: async (file, photoId, rotation = 0) => {
    if (!file || !folderHandle) return null;
    const photos = await folderHandle.getDirectoryHandle("photos", { create: true });
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const scale = Math.min(1, 2560 / side);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(side * scale));
    canvas.height = canvas.width;
    const context = canvas.getContext("2d");
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
    bitmap.close();
    const normalized = await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not normalize image")), "image/jpeg", 0.9));
    const relativePath = `photos/${photoId}.jpg`;
    const photoHandle = await photos.getFileHandle(`${photoId}.jpg`, { create: true });
    const writable = await photoHandle.createWritable();
    await writable.write(await normalized.arrayBuffer());
    await writable.close();
    return relativePath;
  },
  transformPhoto: async (relativePath, photoId, rotation) => {
    if (!folderHandle || !relativePath) return null;
    const [directoryName, fileName] = relativePath.split("/");
    const directory = await folderHandle.getDirectoryHandle(directoryName);
    const fileHandle = await directory.getFileHandle(fileName);
    return fileStore.savePhoto(await fileHandle.getFile(), photoId, rotation);
  },
  deletePhoto: async (relativePath) => {
    if (!folderHandle || !relativePath) return;
    const [directoryName, fileName] = relativePath.split("/");
    const directory = await folderHandle.getDirectoryHandle(directoryName);
    await directory.removeEntry(fileName);
  },
  photoUrl: async (relativePath) => {
    if (!folderHandle || !relativePath) return null;
    const [directoryName, fileName] = relativePath.split("/");
    const directory = await folderHandle.getDirectoryHandle(directoryName);
    const fileHandle = await directory.getFileHandle(fileName);
    return URL.createObjectURL(await fileHandle.getFile());
  }
};
