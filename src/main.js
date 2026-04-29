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
  let selectedFilter = 0;

  // INITIAL LOAD
  const urlParams = new URLSearchParams(window.location.search);
  const isAdmin = urlParams.get('admin') === 'spruce';
  
  loadGallery();

  // Filter Selection Logic
  const filterCards = document.querySelectorAll('.filter-card');
  const filterSelectorArea = document.getElementById('filterSelector');
  
  filterCards.forEach(card => {
    card.addEventListener('click', () => {
      filterCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      selectedFilter = parseInt(card.dataset.filter);
      console.log("Selected filter:", selectedFilter);
    });
  });

  // UPLOAD HANDLER
  photoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // RESIZE AND CROP TO SQUARE (1:1)
        const canvas = document.createElement('canvas');
        const targetSize = 1024; 
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext('2d');

        // Center crop logic
        let sx, sy, sWidth, sHeight;
        if (img.width > img.height) {
          sWidth = img.height;
          sHeight = img.height;
          sx = (img.width - img.height) / 2;
          sy = 0;
        } else {
          sWidth = img.width;
          sHeight = img.width;
          sx = 0;
          sy = (img.height - img.width) / 2;
        }

        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetSize, targetSize);

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

    viewfinder.innerHTML = `
      <div class="processing-state hidden" id="processingState">
        <div class="countdown-container">
          <span id="countdownTimer" class="countdown-number">8</span>
        </div>
        <p id="processingText">Summoning the magic...</p>
      </div>
    `;
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
    const countdownTimer = document.getElementById('countdownTimer');
    const processingText = document.getElementById('processingText');
    
    proc.classList.remove('hidden');
    viewfinder.classList.add('processing');
    applyFilterBtn.disabled = true;
    newPhotoBtn.disabled = true;
    filterSelectorArea.style.display = 'none';
    modalStatus.textContent = "Summoning the dragon...";
    
    let timeLeft = 8;
    countdownTimer.textContent = timeLeft;
    
    const timerInterval = setInterval(() => {
      timeLeft--;
      if (timeLeft > 0) {
        countdownTimer.textContent = timeLeft;
      } else {
        countdownTimer.textContent = "✨";
        processingText.textContent = "Finalizing magic...";
      }
    }, 1000);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          image: currentPhotoBase64,
          filterIndex: selectedFilter 
        })
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
      clearInterval(timerInterval);
      proc.classList.add('hidden');
      viewfinder.classList.remove('processing');
      applyFilterBtn.disabled = false;
      newPhotoBtn.disabled = false;
      filterSelectorArea.style.display = 'block';
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
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Server error");
      }
    } catch (error) {
      console.error("Share Error:", error);
      modalStatus.innerHTML = `<span style="color: #ef4444">Error: ${error.message}</span>`;
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
        div.innerHTML = `
          <div class="gallery-image-container">
            <img src="${item.url}" alt="Dragon transformation" loading="lazy">
            <div class="gallery-item-overlay">
              <button class="gallery-icon-btn like-btn" title="Me gusta">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                </svg>
              </button>
              <button class="gallery-icon-btn download-btn" title="Descargar">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </button>
              ${isAdmin ? `
              <button class="gallery-icon-btn delete-btn" title="Borrar (Admin)">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>` : ''}
            </div>
          </div>
        `;

        // Like toggle
        const likeBtn = div.querySelector('.like-btn');
        likeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          likeBtn.classList.toggle('active');
          const svg = likeBtn.querySelector('svg');
          if (likeBtn.classList.contains('active')) {
            svg.setAttribute('fill', 'currentColor');
            likeBtn.style.color = '#ef4444';
          } else {
            svg.setAttribute('fill', 'none');
            likeBtn.style.color = 'white';
          }
        });

        // Download logic
        const downloadBtn = div.querySelector('.download-btn');
        downloadBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            const response = await fetch(item.url);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dragon-spruce-${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
          } catch (err) {
            console.error("Download error:", err);
          }
        });

        // Delete logic
        const deleteBtn = div.querySelector('.delete-btn');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm("¿Estás seguro de que quieres borrar esta foto para siempre?")) return;
            
            try {
              const res = await fetch(`/api/gallery/${item.id}`, { method: 'DELETE' });
              if (res.ok) {
                div.style.transform = 'scale(0.8)';
                div.style.opacity = '0';
                setTimeout(() => div.remove(), 300);
              }
            } catch (err) {
              console.error("Delete error:", err);
            }
          });
        }

        galleryGrid.appendChild(div);
      });
    } catch (error) {
      console.error("Load Gallery Error:", error);
    }
  }
});
