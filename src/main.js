document.addEventListener('DOMContentLoaded', () => {
  const photoInput = document.getElementById('photoInput');
  const photoModal = document.getElementById('photoModal');
  const closeModal = document.getElementById('closeModal');
  const viewfinder = document.getElementById('photoViewfinder');
  const applyFilterBtn = document.getElementById('applyFilterBtn');
  const newPhotoBtn = document.getElementById('newPhotoBtn');
  const shareGalleryBtn = document.getElementById('shareGalleryBtn');
  const galleryGrid = document.getElementById('galleryGrid');
  const processingState = document.getElementById('processingState');
  const modalStatus = document.getElementById('modalStatus');

  let currentPhotoBase64 = null;
  let transformedPhotoUrl = null;
  let previewImage = null;

  // INITIAL LOAD
  loadGallery();

  // UPLOAD HANDLER
  photoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // RESIZE TO MAX 800px TO PREVENT API OVERLOAD
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 800;

        if (width > height) {
          if (width > maxDim) {
            height *= maxDim / width;
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width *= maxDim / height;
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        currentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.85); // JPEG slightly smaller
        showModal(currentPhotoBase64);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });

  function showModal(imgSrc) {
    photoModal.classList.remove('hidden');
    transformedPhotoUrl = null;
    modalStatus.textContent = "Ready to add some magic?";

    viewfinder.innerHTML = '<div class="processing-state hidden" id="processingState"><div class="spinner"></div><p>Transforming...</p></div>';
    previewImage = document.createElement('img');
    previewImage.src = imgSrc;
    previewImage.style.width = '100%';
    previewImage.style.height = '100%';
    previewImage.style.objectFit = 'contain';
    viewfinder.appendChild(previewImage);

    // Clear and re-get the element since we rewrote innerHTML
    const newProcessingState = document.getElementById('processingState');
    applyFilterBtn.disabled = false;
    shareGalleryBtn.disabled = true;
  }

  closeModal.addEventListener('click', () => {
    photoModal.classList.add('hidden');
    photoInput.value = '';
  });

  // APPLY FILTER
  applyFilterBtn.addEventListener('click', async () => {
    const proc = document.getElementById('processingState');
    proc.classList.remove('hidden');
    applyFilterBtn.disabled = true;
    modalStatus.textContent = "Summoning the dragon...";

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: currentPhotoBase64 })
      });

      const data = await response.json();

      if (response.ok && data.imageUrl) {
        transformedPhotoUrl = data.imageUrl;
        previewImage.src = transformedPhotoUrl;
        modalStatus.textContent = "Wow! Looking legendary!";
        shareGalleryBtn.disabled = false;

        previewImage.onerror = () => {
          console.error("Transformed image failed to load");
          modalStatus.textContent = "Image generated but failed to load.";
        };
      } else {
        throw new Error(data.error || data.warning || "Generation failed");
      }
    } catch (error) {
      console.error("AI Error:", error);
      modalStatus.innerHTML = `<span style="color: #ef4444">Error: ${error.message}</span>`;
      shareGalleryBtn.disabled = true;
    } finally {
      proc.classList.add('hidden');
    }
  });

  // NEW PHOTO
  newPhotoBtn.addEventListener('click', () => {
    photoInput.click();
  });

  // SHARE
  shareGalleryBtn.addEventListener('click', async () => {
    if (!transformedPhotoUrl) return;

    shareGalleryBtn.disabled = true;
    modalStatus.textContent = "Saving to the scroll of honor...";

    try {
      const response = await fetch('/api/gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: transformedPhotoUrl })
      });

      if (response.ok) {
        modalStatus.textContent = "Shared! Check the gallery below.";
        setTimeout(() => {
          photoModal.classList.add('hidden');
          loadGallery();
        }, 1500);
      }
    } catch (error) {
      console.error("Share Error:", error);
      modalStatus.textContent = "Could not share. Try again?";
      shareGalleryBtn.disabled = false;
    }
  });

  async function loadGallery() {
    try {
      const response = await fetch('/api/gallery');
      const data = await response.json();

      galleryGrid.innerHTML = '';

      if (data.length === 0) {
        galleryGrid.innerHTML = '<div class="gallery-empty">Be the first to share a dragon!</div>';
        return;
      }

      data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'gallery-item';
        div.innerHTML = `<img src="${item.url}" alt="Dragon transformation" loading="lazy" onerror="this.parentElement.style.display='none'">`;
        galleryGrid.appendChild(div);
      });
    } catch (error) {
      console.error("Load Gallery Error:", error);
    }
  }
});
