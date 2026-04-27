document.addEventListener('DOMContentLoaded', () => {
  /* ========================================
     iOS 防橡皮筋滚动
     ======================================== */
  document.body.addEventListener('touchmove', (e) => {
    // 允许在可滚动区域内部滚动
    const scrollable = e.target.closest('.works-scroll, .about-scroll, .lightbox-content, .video-modal-content');
    if (!scrollable) {
      e.preventDefault();
    }
  }, { passive: false });

  /* ========================================
     DOM 元素
     ======================================== */
  const pages = document.querySelectorAll('.page');
  const navItems = document.querySelectorAll('.nav-item');
  const worksGrid = document.getElementById('worksGrid');

  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const lightboxClose = lightbox.querySelector('.lightbox-close');
  const lightboxPrev = lightbox.querySelector('.lightbox-prev');
  const lightboxNext = lightbox.querySelector('.lightbox-next');

  const videoModal = document.getElementById('videoModal');
  const modalVideo = document.getElementById('modalVideo');
  const videoModalClose = videoModal.querySelector('.video-modal-close');

  let worksData = [];
  let currentImageIndex = 0;
  let imageWorks = [];
  let worksLoaded = false;

  /* ========================================
     页面切换
     ======================================== */
  function switchPage(pageName) {
    pages.forEach(p => p.classList.toggle('active', p.id === `page${pageName.charAt(0).toUpperCase() + pageName.slice(1)}`));
    navItems.forEach(n => n.classList.toggle('active', n.dataset.page === pageName));
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const pageName = item.dataset.page;
      switchPage(pageName);

      if (pageName === 'works' && !worksLoaded) {
        loadWorks();
        worksLoaded = true;
      }
    });
  });

  // 默认加载作品（后台预加载）
  loadWorks();
  worksLoaded = true;

  /* ========================================
     加载并渲染作品
     ======================================== */
  async function loadWorks() {
    try {
      const response = await fetch('data/works.json');
      worksData = await response.json();
    } catch (err) {
      console.warn('无法加载 works.json，使用默认数据', err);
      worksData = getDefaultWorks();
    }

    imageWorks = worksData.filter(w => w.type === 'image');
    renderWorks(worksData);
    observeWorkCards();
  }

  function getDefaultWorks() {
    return [
      { id: 1, title: "官湖 · 大海与狗", type: "video", cover: "assets/images/works/work-01.jpg", source: "assets/videos/work-01.mp4" },
      { id: 2, title: "致橡树", type: "image", cover: "assets/images/works/work-02.jpg", source: "assets/images/works/work-02.jpg" },
      { id: 3, title: "城市之光", type: "image", cover: "assets/images/works/work-03.jpg", source: "assets/images/works/work-03.jpg" },
      { id: 4, title: "咖啡时光", type: "video", cover: "assets/images/works/work-04.jpg", source: "assets/videos/work-02.mp4" },
      { id: 5, title: "山间晨雾", type: "image", cover: "assets/images/works/work-05.jpg", source: "assets/images/works/work-05.jpg" },
      { id: 6, title: "老街记忆", type: "image", cover: "assets/images/works/work-06.jpg", source: "assets/images/works/work-06.jpg" },
      { id: 7, title: "追光者", type: "video", cover: "assets/images/works/work-07.jpg", source: "assets/videos/work-03.mp4" },
      { id: 8, title: "静物集", type: "image", cover: "assets/images/works/work-08.jpg", source: "assets/images/works/work-08.jpg" }
    ];
  }

  function renderWorks(data) {
    worksGrid.innerHTML = data.map(work => {
      const isVideo = work.type === 'video';
      return `
        <div class="work-card" data-id="${work.id}" data-type="${work.type}">
          <img src="${work.cover}" alt="${work.title}" loading="lazy">
          ${isVideo ? `
            <div class="work-play">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            </div>
          ` : ''}
          <div class="work-info">
            <span class="work-title">${work.title}</span>
          </div>
        </div>
      `;
    }).join('');

    worksGrid.querySelectorAll('.work-card').forEach(card => {
      card.addEventListener('click', () => {
        if (worksGrid.dataset.justDragged === 'true') return;

        const id = parseInt(card.dataset.id);
        const work = worksData.find(w => w.id === id);
        if (!work) return;

        if (work.type === 'image') {
          openLightbox(work);
        } else {
          openVideoModal(work);
        }
      });
    });

    enableDragSort(worksGrid);
  }

  /* ========================================
     卡片进场动画
     ======================================== */
  function observeWorkCards() {
    const cardObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            cardObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    worksGrid.querySelectorAll('.work-card').forEach(card => cardObserver.observe(card));
  }

  /* ========================================
     拖拽排序（SortableJS）
     ======================================== */
  let sortableInstance = null;

  function enableDragSort(container) {
    if (typeof Sortable === 'undefined') return;

    if (sortableInstance) {
      sortableInstance.destroy();
      sortableInstance = null;
    }

    sortableInstance = Sortable.create(container, {
      animation: 180,
      easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      ghostClass: 'work-card-ghost',
      chosenClass: 'work-card-chosen',
      dragClass: 'work-card-drag',
      forceFallback: true,
      fallbackTolerance: 5,
      delay: 0,
      delayOnTouchOnly: true,
      touchStartThreshold: 3,

      onStart() {
        container.dataset.justDragged = 'true';
      },

      onEnd(evt) {
        if (evt.oldIndex !== evt.newIndex) {
          const ids = [...container.querySelectorAll('.work-card')].map(c => parseInt(c.dataset.id));
          const map = new Map(worksData.map(w => [w.id, w]));
          worksData = ids.map(id => map.get(id)).filter(Boolean);
          imageWorks = worksData.filter(w => w.type === 'image');
        }

        setTimeout(() => {
          delete container.dataset.justDragged;
        }, 50);
      }
    });
  }

  /* ========================================
     Lightbox 灯箱
     ======================================== */
  function openLightbox(work) {
    currentImageIndex = imageWorks.findIndex(w => w.id === work.id);
    if (currentImageIndex === -1) currentImageIndex = 0;
    updateLightbox();
    lightbox.classList.add('active');
  }

  function updateLightbox() {
    const work = imageWorks[currentImageIndex];
    lightboxImg.src = work.source;
    lightboxImg.alt = work.title;
    lightboxCaption.textContent = work.title;
  }

  function closeLightbox() {
    lightbox.classList.remove('active');
  }

  function prevImage() {
    currentImageIndex = (currentImageIndex - 1 + imageWorks.length) % imageWorks.length;
    updateLightbox();
  }

  function nextImage() {
    currentImageIndex = (currentImageIndex + 1) % imageWorks.length;
    updateLightbox();
  }

  lightboxClose.addEventListener('click', closeLightbox);
  lightboxPrev.addEventListener('click', (e) => { e.stopPropagation(); prevImage(); });
  lightboxNext.addEventListener('click', (e) => { e.stopPropagation(); nextImage(); });

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox || e.target.classList.contains('lightbox-content')) {
      closeLightbox();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('active')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') prevImage();
    if (e.key === 'ArrowRight') nextImage();
  });

  /* 灯箱滑动手势 */
  let lightboxTouchStartX = 0;
  lightbox.addEventListener('touchstart', (e) => {
    lightboxTouchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  lightbox.addEventListener('touchend', (e) => {
    const diff = e.changedTouches[0].screenX - lightboxTouchStartX;
    if (Math.abs(diff) > 50) {
      diff > 0 ? prevImage() : nextImage();
    }
  }, { passive: true });

  /* ========================================
     视频模态框
     ======================================== */
  function openVideoModal(work) {
    modalVideo.src = work.source;
    modalVideo.poster = work.cover;
    videoModal.classList.add('active');
    modalVideo.play().catch(() => {});
  }

  function closeVideoModal() {
    videoModal.classList.remove('active');
    modalVideo.pause();
    modalVideo.src = '';
  }

  videoModalClose.addEventListener('click', closeVideoModal);
  videoModal.addEventListener('click', (e) => {
    if (e.target === videoModal) closeVideoModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && videoModal.classList.contains('active')) {
      closeVideoModal();
    }
  });
});
