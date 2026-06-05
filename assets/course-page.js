(function () {
  'use strict';

  var COURSE_FIELDS = [
    'title',
    'contentBlocks',
  ];

  function select(selector, root) {
    return (root || document).querySelector(selector);
  }

  function toText(value) {
    return value === undefined || value === null ? '' : String(value).trim();
  }

  function getCourseSlug() {
    var parts = window.location.pathname.split('/').filter(Boolean);
    var slug = parts[0] === 'preview' && parts[1] === 'courses' ? parts[2] : parts[1];
    return decodeURIComponent(toText(slug));
  }

  function setText(selector, value, fallback) {
    var node = select(selector);
    if (!node) return;
    node.textContent = toText(value) || fallback || '';
    node.hidden = !node.textContent;
  }

  function setHidden(selector, hidden) {
    var node = select(selector);
    if (node) node.hidden = Boolean(hidden);
  }

  function createElement(tagName, className, text) {
    var element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function createFact(label, value) {
    var normalizedLabel = toText(label);
    var normalizedValue = toText(value);
    if (!normalizedLabel && !normalizedValue) return null;

    var wrapper = createElement('div');
    wrapper.appendChild(createElement('dt', '', normalizedLabel || 'Факт'));
    wrapper.appendChild(createElement('dd', '', normalizedValue || 'Не указано'));
    return wrapper;
  }

  function buildDynamicHero(block) {
    return {
      title: toText(block && block.title),
      subtitle: toText(block && block.subtitle),
      statusLabel: toText(block && block.statusLabel),
      imageUrl: toText(block && block.imageUrl),
      primaryButtonLabel: toText(block && block.primaryButtonLabel) || 'Перейти',
      primaryButtonUrl: toText(block && block.primaryButtonUrl),
      priceLabel: toText(block && block.priceLabel),
      facts: Array.isArray(block && block.facts) ? block.facts : [],
    };
  }

  function renderHeroElement(hero) {
    var section = createElement('section', 'course-hero');
    var copy = createElement('div', 'course-hero-copy');

    if (toText(hero.statusLabel)) {
      copy.appendChild(createElement('p', 'course-eyebrow', hero.statusLabel));
    }
    copy.appendChild(createElement('h1', '', hero.title || 'Курс'));

    if (toText(hero.subtitle)) {
      copy.appendChild(createElement('p', 'course-lead', hero.subtitle));
    }

    var facts = createElement('dl', 'course-facts');
    (Array.isArray(hero.facts) ? hero.facts : []).forEach(function (fact) {
      var factNode = createFact(fact && fact.label, fact && fact.value);
      if (factNode) facts.appendChild(factNode);
    });
    if (facts.children.length) {
      copy.appendChild(facts);
    }

    var actions = createElement('div', 'course-actions');
    if (toText(hero.primaryButtonUrl)) {
      var button = createElement('a', 'course-button', hero.primaryButtonLabel || 'Перейти');
      button.href = hero.primaryButtonUrl;
      button.target = '_blank';
      button.rel = 'noopener';
      actions.appendChild(button);
    }
    if (toText(hero.priceLabel)) {
      actions.appendChild(createElement('span', 'course-price', hero.priceLabel));
    }
    if (actions.children.length) {
      copy.appendChild(actions);
    }

    section.appendChild(copy);

    if (toText(hero.imageUrl)) {
      var media = createElement('div', 'course-hero-media');
      var image = createElement('img');
      image.src = hero.imageUrl;
      image.alt = toText(hero.title);
      media.appendChild(image);
      section.appendChild(media);
    }

    return section;
  }

  function appendRichText(parent, value) {
    var text = toText(value);
    if (!text) return;

    text.split(/\n{2,}/).forEach(function (paragraph) {
      var normalized = paragraph.replace(/\n/g, ' ').trim();
      if (normalized) {
        parent.appendChild(createElement('p', '', normalized));
      }
    });
  }

  function createBlock(title, modifier) {
    var section = createElement('section', 'course-block' + (modifier ? ' ' + modifier : ''));
    if (toText(title)) {
      section.appendChild(createElement('h2', '', title));
    }
    return section;
  }

  function renderHeroBlock(block) {
    return renderHeroElement(buildDynamicHero(block));
  }

  function renderTextSection(block) {
    var section = createBlock(block.title, 'course-text');
    var body = createElement('div', 'course-richtext');
    appendRichText(body, block.body);
    section.appendChild(body);
    return section;
  }

  function renderFeatureList(block) {
    var section = createBlock(block.title, 'course-features');
    var list = createElement('ul', 'course-feature-grid');
    (Array.isArray(block.items) ? block.items : []).forEach(function (item) {
      var label = toText(item && item.label);
      var text = toText(item && item.text);
      if (!label && !text) return;

      var listItem = createElement('li', 'course-feature-item');
      if (label) listItem.appendChild(createElement('h3', '', label));
      if (text) listItem.appendChild(createElement('p', '', text));
      list.appendChild(listItem);
    });
    section.appendChild(list);
    return section;
  }

  function renderFaq(block) {
    var section = createBlock(block.title || 'Вопросы и ответы', 'course-faq');
    var list = createElement('div', 'course-faq-list');
    (Array.isArray(block.items) ? block.items : []).forEach(function (item) {
      var question = toText(item && item.question);
      var answer = toText(item && item.answer);
      if (!question && !answer) return;

      var details = createElement('details');
      details.appendChild(createElement('summary', '', question || 'Вопрос'));
      var answerNode = createElement('div', 'course-faq-answer course-richtext');
      appendRichText(answerNode, answer);
      details.appendChild(answerNode);
      list.appendChild(details);
    });
    section.appendChild(list);
    return section;
  }

  function renderCta(block) {
    var section = createBlock('', 'course-cta');
    var copy = createElement('div');
    if (toText(block.title)) copy.appendChild(createElement('h2', '', block.title));
    if (toText(block.text)) copy.appendChild(createElement('p', '', block.text));
    section.appendChild(copy);

    if (toText(block.buttonUrl)) {
      var button = createElement('a', 'course-button', block.buttonLabel || 'Перейти');
      button.href = block.buttonUrl;
      button.target = '_blank';
      button.rel = 'noopener';
      section.appendChild(button);
    }

    return section;
  }

  function renderImageSection(block) {
    var section = createBlock(block.title, 'course-image');
    var imageUrl = toText(block.imageUrl);
    if (imageUrl) {
      var figure = createElement('figure');
      var image = createElement('img');
      image.src = imageUrl;
      image.alt = toText(block.caption || block.title);
      figure.appendChild(image);
      if (toText(block.caption)) {
        figure.appendChild(createElement('figcaption', '', block.caption));
      }
      section.appendChild(figure);
    }
    return section;
  }

  var renderers = {
    'course-blocks.hero': renderHeroBlock,
    'course-blocks.text-section': renderTextSection,
    'course-blocks.feature-list': renderFeatureList,
    'course-blocks.faq': renderFaq,
    'course-blocks.cta': renderCta,
    'course-blocks.image-section': renderImageSection,
  };

  function renderBlocks(blocks, course) {
    var container = select('[data-course-blocks]');
    if (!container) return;

    container.textContent = '';
    var renderedCount = 0;
    (Array.isArray(blocks) ? blocks : []).forEach(function (block) {
      var component = toText(block && block.__component);
      var render = renderers[component];
      if (!render) return;

      var node = render(block, course);
      if (node) {
        container.appendChild(node);
        renderedCount += 1;
      }
    });

    if (!renderedCount) {
      var empty = createBlock('Контентные блоки пока не заполнены', 'course-empty');
      empty.appendChild(createElement('p', '', 'Добавьте блоки в поле "Контентные блоки страницы курса" в Strapi.'));
      container.appendChild(empty);
    }
  }

  function renderCourse(course) {
    document.title = course.title ? course.title + ' — Академия' : 'Курс Академии';
    var blocks = Array.isArray(course.contentBlocks) ? course.contentBlocks : [];

    renderBlocks(blocks, course);
    setHidden('[data-course-loading]', true);
    setHidden('[data-course-error]', true);
    setHidden('[data-course-content]', false);
  }

  function showError(message) {
    setHidden('[data-course-loading]', true);
    setHidden('[data-course-content]', true);
    setHidden('[data-course-error]', false);
    setText('[data-course-error-message]', message || 'Не удалось загрузить курс.');
  }

  async function loadCourse() {
    var slug = getCourseSlug();
    if (!slug) {
      showError('В URL не указан slug курса.');
      return;
    }

    try {
      var response = await fetch('/api/tilda/courses/' + encodeURIComponent(slug) + '?fields=' + COURSE_FIELDS.join(','), {
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
      });
      var payload = await response.json().catch(function () { return null; });

      if (!response.ok || !payload || !payload.ok || !payload.data) {
        showError('Курс с таким slug не найден.');
        return;
      }

      renderCourse(payload.data);
    } catch (error) {
      showError('Не удалось загрузить данные курса.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadCourse);
  } else {
    loadCourse();
  }
}());
