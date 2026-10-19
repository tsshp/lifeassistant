const emptyData = () => ({ version: 1, trips: [], items: [], purchases: [], receipts: [] });
let folderHandle = null;
let data = emptyData();

async function readData() {
  if (!folderHandle) return data;
  try {
    const fileHandle = await folderHandle.getFileHandle("riceball.json");
    data = JSON.parse(await (await fileHandle.getFile()).text());
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
    if (!("showDirectoryPicker" in window)) throw new Error("This browser does not support folder access. Use Chrome on Android.");
    folderHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    if (!(await ensurePermission())) throw new Error("Read/write permission was not granted for the selected folder");
    await readData();
    return data;
  },
  load: readData,
  save: async (nextData) => { data = nextData; await writeData(); return data; },
  savePhoto: async (file, photoId) => {
    if (!file || !folderHandle) return null;
    const photos = await folderHandle.getDirectoryHandle("photos", { create: true });
    const extension = (file.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
    const relativePath = `photos/${photoId}.${extension}`;
    const photoHandle = await photos.getFileHandle(`${photoId}.${extension}`, { create: true });
    const writable = await photoHandle.createWritable();
    await writable.write(await file.arrayBuffer());
    await writable.close();
    return relativePath;
  },
  photoUrl: async (relativePath) => {
    if (!folderHandle || !relativePath) return null;
    const [directoryName, fileName] = relativePath.split("/");
    const directory = await folderHandle.getDirectoryHandle(directoryName);
    const fileHandle = await directory.getFileHandle(fileName);
    return URL.createObjectURL(await fileHandle.getFile());
  }
};
