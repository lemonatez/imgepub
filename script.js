const input = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const container = document.getElementById("images");
const status = document.getElementById("status");
const errorBox = document.getElementById("error");
const downloadBtn = document.getElementById("downloadAll");

let cleanedImages = [];

// -------------------- UI helpers --------------------
function setStatus(msg) {
  status.textContent = msg;
}

function setError(msg) {
  errorBox.textContent = msg;
}

function clearMessages() {
  status.textContent = "";
  errorBox.textContent = "";
}

// -------------------- drag & drop --------------------
dropZone.addEventListener("click", () => input.click());

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.style.borderColor = "#4c8bf5";
});

dropZone.addEventListener("dragleave", () => {
  dropZone.style.borderColor = "#444";
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.style.borderColor = "#444";

  const file = e.dataTransfer.files[0];
  handleFile(file);
});

input.addEventListener("change", (e) => {
  handleFile(e.target.files[0]);
});

// -------------------- main logic --------------------
async function handleFile(file) {
  clearMessages();
  container.innerHTML = "";
  cleanedImages = [];
  downloadBtn.disabled = true;

  if (!file) return;

  if (!file.name.endsWith(".epub")) {
    setError("❌ Please upload a valid EPUB file");
    return;
  }

  try {
    setStatus("📦 Reading EPUB...");

    const zip = await JSZip.loadAsync(file);

    // find OPF
    let opfFile = Object.keys(zip.files).find(f => f.endsWith(".opf"));

    if (!opfFile) throw new Error("OPF file not found");

    setStatus("📖 Parsing OPF...");

    const opfText = await zip.files[opfFile].async("string");
    const xml = new DOMParser().parseFromString(opfText, "text/xml");

    const items = [...xml.querySelectorAll("manifest > item")];

    let imageItems = items.filter(item =>
      item.getAttribute("media-type")?.startsWith("image")
    );

    if (imageItems.length === 0) {
      throw new Error("No images found in EPUB");
    }

    // sort images
    imageItems.sort((a, b) =>
      a.getAttribute("href").localeCompare(
        b.getAttribute("href"),
        undefined,
        { numeric: true }
      )
    );

    const basePath = opfFile.substring(0, opfFile.lastIndexOf("/") + 1);

    setStatus(`🖼 Processing ${imageItems.length} images...`);

    let count = 0;

    for (let item of imageItems) {
      const href = item.getAttribute("href");
      const fullPath = basePath + href;

      const fileObj = zip.file(fullPath);
      if (!fileObj) continue;

      const blob = await fileObj.async("blob");

      const cleanBlob = await stripMetadata(blob);

      const filename = href.split("/").pop();

      cleanedImages.push({
        name: filename,
        blob: cleanBlob
      });

      const url = URL.createObjectURL(cleanBlob);

      const img = document.createElement("img");
      img.src = url;

      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.appendChild(img);

      container.appendChild(link);

      count++;
      setStatus(`🖼 Processing ${count}/${imageItems.length}`);
    }

    setStatus("✅ Done!");
    downloadBtn.disabled = false;

  } catch (err) {
    console.error(err);
    setError("❌ " + err.message);
    setStatus("");
  }
}

// -------------------- metadata cleaner --------------------
async function stripMetadata(blob) {
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const type = blob.type || "image/jpeg";

      canvas.toBlob(
        (newBlob) => resolve(newBlob),
        type,
        0.95
      );
    };

    img.onerror = () => resolve(blob); // fallback

    img.src = URL.createObjectURL(blob);
  });
}

// -------------------- download zip --------------------
downloadBtn.addEventListener("click", async () => {
  try {
    setStatus("📦 Creating ZIP...");

    const zip = new JSZip();

    for (let img of cleanedImages) {
      zip.file(img.name, img.blob);
    }

    const content = await zip.generateAsync({ type: "blob" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(content);
    a.download = "images.zip";
    a.click();

    setStatus("✅ Download ready");

  } catch (err) {
    setError("❌ Failed to create ZIP");
  }
});