document.addEventListener('DOMContentLoaded', () => {
  /* ========================================
     iOS 防橡皮筋滚动
     ======================================== */
  document.body.addEventListener('touchmove', (e) => {
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
  const worksScroll = document.getElementById('worksScroll');
  const ipLayer = document.getElementById('ipLayer');
  const ipGrid = document.getElementById('ipGrid');
  const ipWorksLayer = document.getElementById('ipWorksLayer');
  const ipWorksTitle = document.getElementById('ipWorksTitle');
  const ipBack = document.getElementById('ipBack');
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

  const actionSheetOverlay = document.getElementById('actionSheetOverlay');
  const actionReplace = document.getElementById('actionReplace');
  const actionDelete = document.getElementById('actionDelete');
  const actionCancel = document.getElementById('actionCancel');

  const uploadInput = document.createElement('input');
  uploadInput.type = 'file';
  uploadInput.accept = 'image/*,video/*';
  uploadInput.style.display = 'none';
  document.body.appendChild(uploadInput);

  const replaceInput = document.createElement('input');
  replaceInput.type = 'file';
  replaceInput.accept = 'image/*,video/*';
  replaceInput.style.display = 'none';
  document.body.appendChild(replaceInput);

  let ipsData = [];
  let currentIP = null;
  let currentWorks = [];
  let imageWorks = [];
  let currentImageIndex = 0;
  let nextUploadId = 9000;
  let longPressTarget = null;

  /* ========================================
     IndexedDB 持久化（整库快照版）

     数据设计：
     - localStorage[SNAPSHOT_KEY] 存整个 ipsData 的元数据快照
       （包含所有 IP / 作品的顺序、标题、类型、文件 key；不存 Blob URL）
     - IndexedDB 存实际的文件 Blob（原文件 + 视频封面缩略图）

     启动流程：
     - 有快照 → 用快照覆盖默认数据，按 sourceKey / coverKey 从 IndexedDB 取 Blob 还原
     - 没快照 → 用默认数据
     ======================================== */
  const DB_NAME = 'portfolio_db';
  const DB_STORE = 'files';
  const SNAPSHOT_KEY = 'portfolio_snapshot_v2';
  const LEGACY_KEY = 'portfolio_uploads'; // 旧版本遗留数据，启动时清理

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(DB_STORE)) {
          req.result.createObjectStore(DB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveFileToDB(key, blob) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadFileFromDB(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteFileFromDB(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * 把当前 ipsData 的结构（不含 Blob URL）序列化存起来。
   * 任何会改变作品列表的操作（替换 / 删除 / 上传 / 排序）之后都应调用。
   */
  function saveIPsSnapshot() {
    const snapshot = ipsData.map(ip => ({
      ipId: ip.ipId,
      ipName: ip.ipName,
      ipDesc: ip.ipDesc || '',
      ipCover: ip.ipCover || '',
      works: ip.works.map(w => ({
        id: w.id,
        title: w.title,
        type: w.type,
        sourceKey: w._sourceKey || null,
        coverKey: w._coverKey || null,
        uploaded: !!w._uploaded
      }))
    }));
    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ version: 2, ipsData: snapshot, nextUploadId }));
    } catch (e) {
      console.warn('保存快照失败（localStorage 可能已满）', e);
    }
  }

  /**
   * 若存在快照，读出来覆盖 ipsData；同时从 IndexedDB 把 Blob 还原成 objectURL。
   * 返回 true 表示成功用快照恢复；false 表示使用默认数据。
   */
  async function loadIPsFromSnapshot() {
    // 一次性迁移：清理旧版本 key
    if (localStorage.getItem(LEGACY_KEY)) {
      localStorage.removeItem(LEGACY_KEY);
    }

    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return false;

    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return false; }
    if (!parsed || !Array.isArray(parsed.ipsData)) return false;

    const restored = [];
    for (const ip of parsed.ipsData) {
      const works = [];
      for (const w of ip.works) {
        const work = {
          id: w.id,
          title: w.title,
          type: w.type,
          cover: '',
          source: '',
          _uploaded: !!w.uploaded,
          _sourceKey: w.sourceKey || undefined,
          _coverKey: w.coverKey || undefined
        };

        // 只有上传过的作品才需要去 IndexedDB 取 Blob
        if (work._sourceKey) {
          try {
            const blob = await loadFileFromDB(work._sourceKey);
            if (blob) {
              work.source = URL.createObjectURL(blob);
              if (work.type === 'image') work.cover = work.source;
            } else {
              // 文件丢失，降级成空作品（仍保留位置和标题）
              work._uploaded = false;
              work._sourceKey = undefined;
              work._coverKey = undefined;
            }
          } catch (e) {
            work._uploaded = false;
            work._sourceKey = undefined;
            work._coverKey = undefined;
          }
        }

        if (work._coverKey && work.type === 'video') {
          try {
            const coverBlob = await loadFileFromDB(work._coverKey);
            if (coverBlob) {
              work.cover = URL.createObjectURL(coverBlob);
            }
          } catch (e) {
            work._coverKey = undefined;
          }
        }

        works.push(work);
      }
      restored.push({
        ipId: ip.ipId,
        ipName: ip.ipName,
        ipDesc: ip.ipDesc || '',
        ipCover: ip.ipCover || '',
        works
      });
    }

    ipsData = restored;
    if (typeof parsed.nextUploadId === 'number' && parsed.nextUploadId > nextUploadId) {
      nextUploadId = parsed.nextUploadId;
    }
    return true;
  }


  /* ========================================
     占位图生成
     ======================================== */
  const IP_COLORS = [
    '#4A6FA5', '#A56A4A', '#648C5A', '#855A8C', '#C95A5A',
    '#5A8C8C', '#C97A5A', '#5A5A8C', '#8C8C5A', '#8C5A7A'
  ];

  function ipColor(ipId) {
    return IP_COLORS[(ipId - 1) % IP_COLORS.length];
  }

  function placeholderSVG(color, text, w, h) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect fill="${encodeURIComponent(color)}" width="${w}" height="${h}"/><text fill="white" font-family="sans-serif" font-size="${Math.round(Math.min(w,h)/14)}" x="${Math.round(w/2)}" y="${Math.round(h/2)}" text-anchor="middle" dominant-baseline="central">${text}</text></svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  function ipCoverSrc(ip) {
    return ip.ipCover || placeholderSVG(ipColor(ip.ipId), '', 400, 533);
  }

  function workCoverSrc(work, ipId) {
    return work.cover || placeholderSVG(ipColor(ipId), work.title, 400, 533);
  }

  /* ========================================
     页面切换（底部 Tab）
     ======================================== */
  function switchPage(pageName) {
    pages.forEach(p => p.classList.toggle('active', p.id === `page${pageName.charAt(0).toUpperCase() + pageName.slice(1)}`));
    navItems.forEach(n => n.classList.toggle('active', n.dataset.page === pageName));

    if (pageName === 'works' && ipWorksLayer.style.display !== 'none') {
      closeIP();
    }
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      switchPage(item.dataset.page);
    });
  });

  /* ========================================
     加载 IP 数据 & 渲染第一层
     ======================================== */
  async function loadIPs() {
    // 先尝试从本地快照恢复（包含用户所有替换 / 删除 / 上传 / 排序的结果）
    const restored = await loadIPsFromSnapshot();

    if (!restored) {
      // 首次访问或快照不存在，才加载默认数据
      try {
        const response = await fetch('data/works.json', { cache: 'no-store' });
        ipsData = await response.json();
      } catch (err) {
        console.warn('无法加载 works.json，使用默认数据', err);
        ipsData = getDefaultIPs();
      }
    }

    renderIPGrid();
  }

  function getDefaultIPs() {
    const names = ['林毅','胡维勤','马天行','殷国辉','郭春林','郭继承','沈亦菲','沈德斌','林一飞','摄影师大景'];
    const descs = ['北京奥运会总摄影师','红墙御医','训犬师','国学','哲学','传统文化','家庭教育','传统文化','女性成长','独立摄影师'];
    return names.map((name, i) => {
      const ipId = i + 1;
      return {
        ipId,
        ipName: name,
        ipDesc: descs[i],
        ipCover: `assets/images/IP covers/${ipId}.jpg`,
        works: [
          { id: ipId * 100 + 1, title: '作品 01', type: 'image', cover: '', source: '' },
          { id: ipId * 100 + 2, title: '作品 02', type: 'video', cover: '', source: '' },
          { id: ipId * 100 + 3, title: '作品 03', type: 'image', cover: '', source: '' },
          { id: ipId * 100 + 4, title: '作品 04', type: 'video', cover: '', source: '' }
        ]
      };
    });
  }

  function renderIPGrid() {
    ipGrid.innerHTML = ipsData.map(ip => `
      <div class="ip-card" data-ip-id="${ip.ipId}">
        <div class="ip-card-cover">
          <img src="${ipCoverSrc(ip)}" alt="${ip.ipName}" loading="lazy">
        </div>
        <div class="ip-card-name">${ip.ipName}</div>
        ${ip.ipDesc ? `<div class="ip-card-desc">${ip.ipDesc}</div>` : ''}
      </div>
    `).join('');

    ipGrid.querySelectorAll('.ip-card').forEach(card => {
      card.addEventListener('click', () => {
        const ipId = parseInt(card.dataset.ipId);
        const ip = ipsData.find(i => i.ipId === ipId);
        if (ip) openIP(ip);
      });
    });
  }

  /* ========================================
     进入 / 退出第二层
     ======================================== */
  function openIP(ip) {
    currentIP = ip;
    currentWorks = [...ip.works];
    imageWorks = currentWorks.filter(w => w.type === 'image');
    // 注意：不要重置 nextUploadId，它是全局递增的；
    // 若需保证不同 IP 间 id 不冲突，初始值已由 snapshot 恢复。

    ipWorksTitle.textContent = ip.ipName;
    renderWorks(currentWorks);
    observeWorkCards();

    ipLayer.style.display = 'none';
    ipWorksLayer.style.display = 'block';
    worksScroll.scrollTop = 0;
  }

  function closeIP() {
    currentIP = null;
    currentWorks = [];
    imageWorks = [];

    ipWorksLayer.style.display = 'none';
    ipLayer.style.display = 'block';
    worksScroll.scrollTop = 0;

    if (sortableInstance) {
      sortableInstance.destroy();
      sortableInstance = null;
    }
  }

  ipBack.addEventListener('click', () => closeIP());

  /* ========================================
     渲染作品（第二层）+ 上传卡片
     ======================================== */
  function renderWorks(works) {
    const ipId = currentIP ? currentIP.ipId : 1;

    let html = works.map(work => {
      const isVideo = work.type === 'video';
      return `
        <div class="work-card" data-id="${work.id}" data-type="${work.type}">
          <img src="${workCoverSrc(work, ipId)}" alt="${work.title}" loading="lazy">
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

    html += `
      <div class="upload-card" id="uploadCard">
        <div class="upload-inner">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span class="upload-text">上传</span>
        </div>
      </div>
    `;

    worksGrid.innerHTML = html;

    bindWorkCardEvents();

    const uploadCard = document.getElementById('uploadCard');
    if (uploadCard) {
      uploadCard.addEventListener('click', () => {
        uploadInput.value = '';
        uploadInput.click();
      });
    }

    enableDragSort(worksGrid);
  }

  /* ========================================
     为所有 work-card 绑定事件（点击 + 长按）
     ======================================== */
  function bindWorkCardEvents() {
    worksGrid.querySelectorAll('.work-card').forEach(card => {
      card.addEventListener('click', handleWorkCardClick);

      let longPressTimer = null;
      card.addEventListener('touchstart', () => {
        longPressTimer = setTimeout(() => {
          longPressTarget = card;
          showActionSheet();
        }, 500);
      }, { passive: true });

      card.addEventListener('touchend', () => {
        clearTimeout(longPressTimer);
      });
      card.addEventListener('touchmove', () => {
        clearTimeout(longPressTimer);
      });

      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        longPressTarget = card;
        showActionSheet();
      });
    });
  }

  function handleWorkCardClick() {
    if (worksGrid.dataset.justDragged === 'true') return;

    const id = parseInt(this.dataset.id);
    const work = currentWorks.find(w => w.id === id);
    if (!work) return;

    if (work.type === 'image' && work.source) {
      openLightbox(work);
    } else if (work.type === 'video' && work.source) {
      openVideoModal(work);
    }
  }

  /* ========================================
     长按操作面板（替换 / 删除）
     ======================================== */
  function showActionSheet() {
    actionSheetOverlay.classList.add('active');
  }

  function hideActionSheet() {
    actionSheetOverlay.classList.remove('active');
    longPressTarget = null;
  }

  actionCancel.addEventListener('click', hideActionSheet);
  actionSheetOverlay.addEventListener('click', (e) => {
    if (e.target === actionSheetOverlay) hideActionSheet();
  });

  // 替换
  actionReplace.addEventListener('click', () => {
    const target = longPressTarget;
    hideActionSheet();
    if (!target) return;
    replaceInput.value = '';
    replaceInput._targetCard = target;
    replaceInput.click();
  });

  replaceInput.addEventListener('change', async () => {
    const file = replaceInput.files[0];
    const card = replaceInput._targetCard;
    if (!file || !card || !currentIP) return;

    const id = parseInt(card.dataset.id);
    const work = currentWorks.find(w => w.id === id);
    if (!work) return;

    // 清理旧文件
    if (work._sourceKey) {
      await deleteFileFromDB(work._sourceKey).catch(() => {});
      URL.revokeObjectURL(work.source);
    }
    if (work._coverKey) {
      await deleteFileFromDB(work._coverKey).catch(() => {});
    }

    const isVideo = file.type.startsWith('video/');
    const blobUrl = URL.createObjectURL(file);
    const sourceKey = `src_${currentIP.ipId}_${id}`;

    work.type = isVideo ? 'video' : 'image';
    work.source = blobUrl;
    work._uploaded = true;
    work._sourceKey = sourceKey;
    delete work._coverKey;

    // 存文件到 IndexedDB
    await saveFileToDB(sourceKey, file);

    if (isVideo) {
      work.cover = '';
      const img = card.querySelector('img');
      if (img) img.src = workCoverSrc(work, currentIP.ipId);
      card.dataset.type = 'video';

      let playEl = card.querySelector('.work-play');
      if (!playEl) {
        playEl = document.createElement('div');
        playEl.className = 'work-play';
        playEl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
        card.appendChild(playEl);
      }

      captureVideoFrame(blobUrl, async (dataUrl) => {
        work.cover = dataUrl;
        if (img) img.src = dataUrl;
        // 存封面缩略图
        if (dataUrl) {
          const resp = await fetch(dataUrl);
          const coverBlob = await resp.blob();
          const coverKey = `cover_${currentIP.ipId}_${id}`;
          work._coverKey = coverKey;
          await saveFileToDB(coverKey, coverBlob);
        }
        saveIPsSnapshot();
      });
    } else {
      work.cover = blobUrl;
      const img = card.querySelector('img');
      if (img) img.src = blobUrl;

      const playEl = card.querySelector('.work-play');
      if (playEl) playEl.remove();

      card.dataset.type = 'image';
    }

    imageWorks = currentWorks.filter(w => w.type === 'image');
    currentIP.works = [...currentWorks];
    saveIPsSnapshot();

    replaceInput._targetCard = null;
  });

  // 视频首帧截图
  function captureVideoFrame(url, callback) {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.addEventListener('loadeddata', () => {
      video.currentTime = 0.1;
    });

    video.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 400;
      canvas.height = video.videoHeight || 533;
      const ctx = canvas.getContext('2d');
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        callback(canvas.toDataURL('image/jpeg', 0.8));
      } catch (e) {
        callback('');
      }
    });

    video.addEventListener('error', () => {
      callback('');
    });

    video.src = url;
    video.load();
  }

  // 删除
  actionDelete.addEventListener('click', async () => {
    const target = longPressTarget;
    hideActionSheet();
    if (!target || !currentIP) return;

    const id = parseInt(target.dataset.id);
    const idx = currentWorks.findIndex(w => w.id === id);
    if (idx === -1) return;

    const work = currentWorks[idx];

    // 清理 IndexedDB 文件
    if (work._sourceKey) {
      URL.revokeObjectURL(work.source);
      await deleteFileFromDB(work._sourceKey).catch(() => {});
    }
    if (work._coverKey) {
      if (work.cover && work.cover.startsWith('blob:')) URL.revokeObjectURL(work.cover);
      await deleteFileFromDB(work._coverKey).catch(() => {});
    }

    currentWorks.splice(idx, 1);
    imageWorks = currentWorks.filter(w => w.type === 'image');
    currentIP.works = [...currentWorks];

    target.remove();

    saveIPsSnapshot();

    if (sortableInstance) {
      sortableInstance.destroy();
      sortableInstance = null;
    }
    enableDragSort(worksGrid);
  });

  /* ========================================
     上传处理（新增作品）
     ======================================== */
  uploadInput.addEventListener('change', async () => {
    const file = uploadInput.files[0];
    if (!file || !currentIP) return;

    const isVideo = file.type.startsWith('video/');
    const blobUrl = URL.createObjectURL(file);
    const id = nextUploadId++;
    const sourceKey = `src_${currentIP.ipId}_${id}`;

    // 图片直接设 cover，视频异步抓帧
    const newWork = {
      id,
      title: file.name,
      type: isVideo ? 'video' : 'image',
      cover: isVideo ? '' : blobUrl,
      source: blobUrl,
      _uploaded: true,
      _sourceKey: sourceKey
    };

    // 存文件到 IndexedDB
    await saveFileToDB(sourceKey, file);

    currentWorks.push(newWork);
    imageWorks = currentWorks.filter(w => w.type === 'image');
    currentIP.works = [...currentWorks];

    // 此时 newWork.cover 对图片已经是 blobUrl，对视频是 ''
    const cardEl = createWorkCardElement(newWork, currentIP.ipId);

    const uploadCardEl = document.getElementById('uploadCard');
    if (uploadCardEl) {
      worksGrid.insertBefore(cardEl, uploadCardEl);
    } else {
      worksGrid.appendChild(cardEl);
    }

    requestAnimationFrame(() => {
      cardEl.classList.add('visible');
    });

    if (isVideo) {
      captureVideoFrame(blobUrl, async (dataUrl) => {
        newWork.cover = dataUrl;
        const img = cardEl.querySelector('img');
        if (img) img.src = dataUrl;
        // 存封面缩略图
        if (dataUrl) {
          const resp = await fetch(dataUrl);
          const coverBlob = await resp.blob();
          const coverKey = `cover_${currentIP.ipId}_${id}`;
          newWork._coverKey = coverKey;
          await saveFileToDB(coverKey, coverBlob);
        }
        saveIPsSnapshot();
      });
    }

    saveIPsSnapshot();

    if (sortableInstance) {
      sortableInstance.destroy();
      sortableInstance = null;
    }
    enableDragSort(worksGrid);
  });

  function createWorkCardElement(work, ipId) {
    const div = document.createElement('div');
    div.className = 'work-card visible';
    div.dataset.id = work.id;
    div.dataset.type = work.type;

    const isVideo = work.type === 'video';
    div.innerHTML = `
      <img src="${workCoverSrc(work, ipId)}" alt="${work.title}" loading="lazy">
      ${isVideo ? `
        <div class="work-play">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </div>
      ` : ''}
      <div class="work-info">
        <span class="work-title">${work.title}</span>
      </div>
    `;

    div.addEventListener('click', handleWorkCardClick);

    let longPressTimer = null;
    div.addEventListener('touchstart', () => {
      longPressTimer = setTimeout(() => {
        longPressTarget = div;
        showActionSheet();
      }, 500);
    }, { passive: true });
    div.addEventListener('touchend', () => clearTimeout(longPressTimer));
    div.addEventListener('touchmove', () => clearTimeout(longPressTimer));
    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      longPressTarget = div;
      showActionSheet();
    });

    return div;
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
     拖拽排序（第二层，排除上传卡片）
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
      delay: 150,
      delayOnTouchOnly: true,
      touchStartThreshold: 5,
      filter: '.upload-card',
      preventOnFilter: false,

      onStart() {
        container.dataset.justDragged = 'true';
      },

      onEnd(evt) {
        if (evt.oldIndex !== evt.newIndex) {
          const ids = [...container.querySelectorAll('.work-card')].map(c => parseInt(c.dataset.id));
          const map = new Map(currentWorks.map(w => [w.id, w]));
          currentWorks = ids.map(id => map.get(id)).filter(Boolean);
          imageWorks = currentWorks.filter(w => w.type === 'image');

          if (currentIP) {
            currentIP.works = [...currentWorks];
          }
          saveIPsSnapshot();
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
    if (!work.source) return;
    currentImageIndex = imageWorks.findIndex(w => w.id === work.id);
    if (currentImageIndex === -1) currentImageIndex = 0;
    updateLightbox();
    lightbox.classList.add('active');
  }

  function updateLightbox() {
    const work = imageWorks[currentImageIndex];
    if (!work) return;
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
     视频全屏播放
     ======================================== */
  function openVideoModal(work) {
    if (!work.source) return;
    modalVideo.src = work.source;
    if (work.cover) modalVideo.poster = work.cover;
    modalVideo.playsInline = false;
    videoModal.classList.add('active');
    modalVideo.play().catch(() => {});

    const goFullscreen = () => {
      if (modalVideo.webkitEnterFullscreen) {
        modalVideo.webkitEnterFullscreen();
      } else if (modalVideo.requestFullscreen) {
        modalVideo.requestFullscreen().catch(() => {});
      }
    };
    modalVideo.addEventListener('playing', goFullscreen, { once: true });
  }

  function onFullscreenExit() {
    if (!videoModal.classList.contains('active')) return;
    const isFullscreen = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement
    );
    if (!isFullscreen) {
      closeVideoModal();
    }
  }

  document.addEventListener('fullscreenchange', onFullscreenExit);
  document.addEventListener('webkitfullscreenchange', onFullscreenExit);

  // iOS 全屏退出后也会触发 webkitendfullscreen
  modalVideo.addEventListener('webkitendfullscreen', closeVideoModal);

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

  /* ========================================
     启动
     ======================================== */
  loadIPs();
});
