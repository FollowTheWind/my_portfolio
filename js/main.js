if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

document.addEventListener('DOMContentLoaded', () => {
  /* ========================================
     DOM 元素
     ======================================== */
  const header = document.getElementById('header');
  const menuToggle = document.getElementById('menuToggle');
  const mainNav = document.getElementById('mainNav');
  const navLinks = document.querySelectorAll('.nav-link');
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

  /* ========================================
     移动端菜单
     ======================================== */
  menuToggle.addEventListener('click', () => {
    menuToggle.classList.toggle('active');
    mainNav.classList.toggle('open');
  });

  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      menuToggle.classList.remove('active');
      mainNav.classList.remove('open');
    });
  });

  /* ========================================
     导航栏滚动效果
     ======================================== */
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });

  /* ========================================
     导航高亮（Intersection Observer）
     ======================================== */
  const sections = document.querySelectorAll('section[id]');
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute('id');
          navLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
          });
        }
      });
    },
    { threshold: 0.3 }
  );
  sections.forEach(section => sectionObserver.observe(section));

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
        // 刚结束拖拽时，抑制一次 click（防止误触发弹窗）
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
     拖拽排序（基于 SortableJS）
     ======================================== */
  let sortableInstance = null;

  function enableDragSort(container) {
    if (typeof Sortable === 'undefined') {
      console.warn('SortableJS 未加载，拖拽排序不可用');
      return;
    }

    // 每次重新渲染都重建实例，避免旧实例绑定在已移除的 DOM 上
    if (sortableInstance) {
      sortableInstance.destroy();
      sortableInstance = null;
    }

    sortableInstance = Sortable.create(container, {
      animation: 180,
      easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      ghostClass: 'work-card-ghost',    // 占位元素样式
      chosenClass: 'work-card-chosen',  // 被选中元素样式
      dragClass: 'work-card-drag',      // 拖动中元素样式
      forceFallback: true,              // 统一走 JS 模拟，避免原生 HTML5 DnD 在 Safari/移动端的差异
      fallbackTolerance: 5,             // 手指/鼠标位移超过 5px 才判定为拖拽，否则视为点击
      delay: 0,
      delayOnTouchOnly: true,
      touchStartThreshold: 3,

      onStart() {
        container.dataset.justDragged = 'true';
        document.body.style.userSelect = 'none';
      },

      onEnd(evt) {
        document.body.style.userSelect = '';

        // 顺序确实发生变化时才同步数据
        if (evt.oldIndex !== evt.newIndex) {
          syncDataOrder();
        }

        // 稍延迟后清除标记，避免 mouseup 后紧接的 click 误触发弹窗
        setTimeout(() => {
          delete container.dataset.justDragged;
        }, 50);
      }
    });

    function syncDataOrder() {
      const ids = [...container.querySelectorAll('.work-card')].map(c => parseInt(c.dataset.id));
      const map = new Map(worksData.map(w => [w.id, w]));
      worksData = ids.map(id => map.get(id)).filter(Boolean);
      imageWorks = worksData.filter(w => w.type === 'image');
    }
  }

  /* ========================================
     Lightbox 灯箱
     ======================================== */
  function openLightbox(work) {
    currentImageIndex = imageWorks.findIndex(w => w.id === work.id);
    if (currentImageIndex === -1) currentImageIndex = 0;
    updateLightbox();
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function updateLightbox() {
    const work = imageWorks[currentImageIndex];
    lightboxImg.src = work.source;
    lightboxImg.alt = work.title;
    lightboxCaption.textContent = work.title;
  }

  function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
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
    document.body.style.overflow = 'hidden';
    modalVideo.play().catch(() => {});
  }

  function closeVideoModal() {
    videoModal.classList.remove('active');
    document.body.style.overflow = '';
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

  /* ========================================
     启动
     ======================================== */
  loadWorks();
});
