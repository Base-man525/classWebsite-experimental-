'use strict';

const API = {
  site: '/api/site',
  members: '/api/members',
  news: '/api/news',
  wechatNews: '/api/wechat/articles?limit=6'
};

const state = {
  members: []
};

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function setText(selector, value) {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = value;
  });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`请求失败：${response.status}`);
  }

  return response.json();
}

function formatDate(value) {
  if (!value) {
    return '日期待定';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '日期待定' : dateFormatter.format(date);
}

function activePanel(panelId) {
  const validPanel = document.querySelector(`.page-panel[data-panel="${panelId}"]`);
  return validPanel ? panelId : 'home';
}

function switchPanel(panelId, options = {}) {
  const nextPanel = activePanel(panelId);
  const tabs = [...document.querySelectorAll('.nav-tab')];
  const panels = [...document.querySelectorAll('.page-panel')];

  tabs.forEach((tab) => {
    const isActive = tab.dataset.panel === nextPanel;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
    if (isActive) {
      tab.setAttribute('aria-current', 'page');
    } else {
      tab.removeAttribute('aria-current');
    }
    tab.tabIndex = isActive ? 0 : -1;
    if (isActive && options.focusTab) {
      tab.focus();
    }
  });

  panels.forEach((panel) => {
    panel.hidden = panel.dataset.panel !== nextPanel;
  });

  const activeTab = tabs.find((tab) => tab.dataset.panel === nextPanel);
  if (activeTab) {
    document.title = `${activeTab.textContent.trim()}｜示例班级`;
  }

  if (options.updateHash !== false) {
    history.replaceState(null, '', `#${nextPanel}`);
  }

  if (options.scroll !== false) {
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  }
}

function bindNavigation() {
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-tab-target]');
    if (!target) {
      return;
    }

    event.preventDefault();
    switchPanel(target.dataset.tabTarget);
  });

  const tabs = [...document.querySelectorAll('.nav-tab')];
  tabs.forEach((tab) => {
    tab.addEventListener('click', (event) => {
      event.preventDefault();
      switchPanel(tab.dataset.panel);
    });
  });
  tabs.forEach((tab, index) => {
    tab.addEventListener('keydown', (event) => {
      let nextIndex = index;

      if (event.key === 'ArrowRight') {
        nextIndex = (index + 1) % tabs.length;
      } else if (event.key === 'ArrowLeft') {
        nextIndex = (index - 1 + tabs.length) % tabs.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = tabs.length - 1;
      } else {
        return;
      }

      event.preventDefault();
      switchPanel(tabs[nextIndex].dataset.panel, {
        focusTab: true,
        scroll: false
      });
    });
  });

  window.addEventListener('hashchange', () => {
    switchPanel(window.location.hash.slice(1) || 'home', { scroll: false });
  });

  switchPanel(window.location.hash.slice(1) || 'home', {
    scroll: false,
    updateHash: false
  });
}

async function loadSiteInfo() {
  try {
    const site = await fetchJson(API.site);
    setText('[data-site-name]', site.siteName || '示例班级');
    setText('[data-site-subtitle]', site.siteSubtitle || '班级信息与成长记录');

    const fields = ['copyright', 'filing', 'address', 'postalCode', 'phone', 'email'];
    fields.forEach((field) => {
      if (site[field]) {
        setText(`[data-site-field="${field}"]`, site[field]);
      }
    });

    const partnerList = document.getElementById('partner-list');
    partnerList.replaceChildren();
    (site.partners || []).forEach((partner) => {
      const item = document.createElement('li');
      item.textContent = partner;
      partnerList.append(item);
    });

    document.title = `${site.siteName || '示例班级'}｜${site.siteSubtitle || '班级信息与成长记录'}`;
  } catch (error) {
    console.error(error);
  }
}

function createNewsCard(item, index) {
  const article = document.createElement('article');
  article.className = 'news-card';

  const cover = document.createElement('div');
  cover.className = `news-cover${index % 3 === 1 ? ' is-amber' : index % 3 === 2 ? ' is-slate' : ''}`;

  const coverIndex = document.createElement('span');
  coverIndex.className = 'news-index';
  coverIndex.textContent = `NEWS ${String(index + 1).padStart(2, '0')}`;

  const coverMark = document.createElement('strong');
  coverMark.textContent = String(index + 1).padStart(2, '0');
  cover.append(coverIndex, coverMark);

  const body = document.createElement('div');
  body.className = 'news-card-body';

  const meta = document.createElement('div');
  meta.className = 'news-meta';

  const author = document.createElement('span');
  author.textContent = item.author || '班级宣传组';

  const time = document.createElement('time');
  time.dateTime = item.publishedAt || '';
  time.textContent = formatDate(item.publishedAt);
  meta.append(author, time);

  const title = document.createElement('h3');
  title.className = 'news-title';
  title.textContent = item.title || '未命名班级新闻';

  const summary = document.createElement('p');
  summary.className = 'news-summary';
  summary.textContent = item.summary || '暂无摘要，点击查看完整内容。';

  const link = document.createElement(item.url ? 'a' : 'span');
  link.className = 'news-link';
  link.textContent = item.url ? '阅读全文 →' : '内容待发布';

  if (item.url) {
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  } else {
    link.setAttribute('aria-disabled', 'true');
  }

  body.append(meta, title, summary, link);
  article.append(cover, body);
  return article;
}

function renderNews(payload) {
  const newsGrid = document.getElementById('news-grid');
  const newsEmpty = document.getElementById('news-empty');
  const source = document.getElementById('news-source');
  const retryButton = document.getElementById('news-retry');
  const items = Array.isArray(payload.items) ? payload.items : [];

  newsGrid.replaceChildren();
  newsGrid.setAttribute('aria-busy', 'false');
  retryButton.hidden = true;

  if (!items.length) {
    newsEmpty.hidden = false;
    source.textContent = '暂无已发布内容';
    return;
  }

  newsEmpty.hidden = true;
  items.slice(0, 6).forEach((item, index) => {
    newsGrid.append(createNewsCard(item, index));
  });

  if (payload.source === 'wechat') {
    source.textContent = `微信公众号 · 已同步 ${items.length} 篇`;
  } else {
    source.textContent = payload.notice || `示例数据 · ${items.length} 篇`;
  }
}

async function loadNews() {
  const newsGrid = document.getElementById('news-grid');
  const newsEmpty = document.getElementById('news-empty');
  const source = document.getElementById('news-source');
  const retryButton = document.getElementById('news-retry');

  newsGrid.setAttribute('aria-busy', 'true');
  newsEmpty.hidden = true;
  retryButton.hidden = true;
  source.textContent = '正在同步新闻…';

  try {
    const payload = await fetchJson(API.wechatNews);
    renderNews(payload);
  } catch (error) {
    console.error(error);

    try {
      const fallback = await fetchJson(API.news);
      renderNews({
        ...fallback,
        source: 'sample-fallback',
        notice: '微信接口暂不可用，当前显示示例新闻。'
      });
    } catch (fallbackError) {
      console.error(fallbackError);
      newsGrid.replaceChildren();
      newsGrid.setAttribute('aria-busy', 'false');
      newsEmpty.hidden = false;
      source.textContent = '新闻加载失败';
      retryButton.hidden = false;
    }
  }
}

function getAvatarLabel(name) {
  const normalized = String(name || '成员').replace(/\s+/g, '');
  return normalized.slice(0, 1) || '成';
}

function createMemberDetail(label, value) {
  const row = document.createElement('div');
  row.className = 'member-detail';

  const term = document.createElement('dt');
  term.textContent = label;

  const description = document.createElement('dd');
  description.textContent = value || '待完善';

  row.append(term, description);
  return row;
}

function createMemberCard(member) {
  const card = document.createElement('article');
  card.className = 'member-card';

  const head = document.createElement('div');
  head.className = 'member-card-head';

  const avatar = document.createElement('div');
  avatar.className = 'member-avatar';

  if (member.avatar) {
    const image = document.createElement('img');
    image.src = member.avatar;
    image.alt = `${member.name || '成员'}的头像`;
    image.loading = 'lazy';
    image.addEventListener('error', () => {
      avatar.replaceChildren(document.createTextNode(getAvatarLabel(member.name)));
    });
    avatar.append(image);
  } else {
    avatar.textContent = getAvatarLabel(member.name);
  }

  const identity = document.createElement('div');
  identity.className = 'member-identity';

  const name = document.createElement('h2');
  name.className = 'member-name';
  name.textContent = member.name || '班级成员';

  const position = document.createElement('span');
  position.className = 'member-position';
  position.textContent = member.position || '班级成员';
  identity.append(name, position);
  head.append(avatar, identity);

  const details = document.createElement('dl');
  details.className = 'member-details';
  details.append(
    createMemberDetail('专业', member.major)
  );

  card.append(head, details);
  return card;
}

function renderMembers(members) {
  const memberGrid = document.getElementById('member-grid');
  const emptyMessage = document.getElementById('member-empty');
  const countBadge = document.getElementById('member-count');
  const heroMemberCount = document.getElementById('hero-member-count');
  const query = document.getElementById('member-search').value.trim().toLowerCase();

  const filteredMembers = members.filter((member) => {
    if (!query) {
      return true;
    }

    return [member.name, member.major, member.position]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  memberGrid.replaceChildren();
  memberGrid.setAttribute('aria-busy', 'false');
  emptyMessage.hidden = filteredMembers.length > 0;

  filteredMembers.forEach((member) => {
    memberGrid.append(createMemberCard(member));
  });

  countBadge.textContent = query
    ? `显示 ${filteredMembers.length} / ${members.length} 位`
    : `共 ${members.length} 位成员`;
  heroMemberCount.textContent = String(members.length).padStart(2, '0');
}

async function loadMembers() {
  const memberGrid = document.getElementById('member-grid');
  const emptyMessage = document.getElementById('member-empty');

  memberGrid.setAttribute('aria-busy', 'true');
  emptyMessage.hidden = true;

  try {
    const payload = await fetchJson(API.members);
    state.members = Array.isArray(payload.members) ? payload.members : [];
    renderMembers(state.members);
  } catch (error) {
    console.error(error);
    memberGrid.replaceChildren();
    memberGrid.setAttribute('aria-busy', 'false');
    emptyMessage.textContent = '成员资料加载失败，请确认服务端 API 已启动。';
    emptyMessage.hidden = false;
    document.getElementById('member-count').textContent = '读取失败';
  }
}

function bindMemberSearch() {
  const searchInput = document.getElementById('member-search');
  searchInput.addEventListener('input', () => {
    renderMembers(state.members);
  });
}

function bindBackToTop() {
  const button = document.getElementById('back-to-top');
  let scheduled = false;

  const updateVisibility = () => {
    scheduled = false;
    const threshold = Math.max(420, Math.min(window.innerHeight * 0.65, 720));
    const canReturn = window.scrollY > threshold;
    button.classList.toggle('is-visible', canReturn);
    button.setAttribute('aria-hidden', String(!canReturn));
  };

  window.addEventListener('scroll', () => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(updateVisibility);
    }
  }, { passive: true });

  button.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  });

  updateVisibility();
}

function bindRetry() {
  document.getElementById('news-retry').addEventListener('click', loadNews);
}

function initialize() {
  bindNavigation();
  bindBackToTop();
  bindMemberSearch();
  bindRetry();
  void loadSiteInfo();
  void loadNews();
  void loadMembers();
}

initialize();