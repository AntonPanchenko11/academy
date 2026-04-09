(function () {
  'use strict';

  var MONTHS_NOMINATIVE = [
    'Январь',
    'Февраль',
    'Март',
    'Апрель',
    'Май',
    'Июнь',
    'Июль',
    'Август',
    'Сентябрь',
    'Октябрь',
    'Ноябрь',
    'Декабрь'
  ];

  var tabsContainer = document.getElementById('monthTabs');
  var monthsContainer = document.getElementById('monthsContainer');
  var waitlistContainer = document.getElementById('waitlistContainer');

  function hasScheduleContainers() {
    return Boolean(tabsContainer && monthsContainer && waitlistContainer);
  }

  function setHtml(node, html) {
    if (!node) return;
    node.innerHTML = html;
  }

  function buildTextState(message) {
    return '<div class="text text-paragraph-medium"><span class="text-block-wrap-div">' + escapeHtml(message) + '</span></div>';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toCourse(row) {
    var src = row || {};

    return {
      id: src.id,
      title: src.title || '',
      comment: src.comment || '',
      date: src.date || '',
      day: src.day || '',
      dateLabel: src.dateLabel || '',
      waitlist: src.waitlist === true,
      courseStatus: src.courseStatus || '',
      studyDays: src.studyDays || '',
      hoursLabel: src.hoursLabel || '',
      price: src.price,
      educationDocument: src.educationDocument || '',
      courseLink: src.courseLink || '#'
    };
  }

  function parseDate(dateValue) {
    if (!dateValue) return null;
    var date = new Date(String(dateValue) + 'T00:00:00');
    return isNaN(date.getTime()) ? null : date;
  }

  function statusClass(courseStatus) {
    if (!courseStatus) return 'schedule-item-date-tag not-active';
    var value = String(courseStatus).toLowerCase();
    if (value.indexOf('sold') !== -1) return 'schedule-item-date-tag-red';
    if (value.indexOf('послед') !== -1) return 'schedule-item-date-tag schedule-item-date-tag-warning';
    return 'schedule-item-date-tag';
  }

  function buildInfoTag(iconFile, text) {
    if (!text) return '';
    return (
      '<div class="div schedule-info-tag">' +
      '<div class="image schedule-tag-icon">' +
      '<img src="./assets/' + iconFile + '" alt="icon" class="image__img">' +
      '</div>' +
      '<div class="text"><span class="text-block-wrap-div">' + escapeHtml(text) + '</span></div>' +
      '</div>'
    );
  }

  function buildHoursTag(course) {
    var hoursLabel = String(course && course.hoursLabel || '').trim();
    if (!hoursLabel) return '';

    return (
      '<div class="div schedule-info-tag">' +
      '<div class="image schedule-tag-icon">' +
      '<img src="./assets/time-circle-icon.svg" alt="time-circle-icon" class="image__img">' +
      '</div>' +
      '<div class="text"><span class="text-block-wrap-div">' + escapeHtml(hoursLabel) + '</span></div>' +
      '</div>'
    );
  }

  function formatPriceNumber(value) {
    var digits = String(value || '').replace(/\s+/g, '');
    if (!digits) return '';

    var num = parseInt(digits, 10);
    if (isNaN(num)) return String(value || '').trim();

    // Keep 4-digit prices without grouping exactly as in the original page.
    if (num >= 1000 && num <= 9999) return String(num);

    return num.toLocaleString('ru-RU').replace(/,/g, ' ');
  }

  function parseNumericPrice(value) {
    if (value === null || value === undefined || value === '') return null;

    if (typeof value === 'number' && isFinite(value)) {
      return Math.round(value);
    }

    var digits = String(value).replace(/[^\d-]/g, '');
    if (!digits) return null;

    var parsed = parseInt(digits, 10);
    return isNaN(parsed) ? null : parsed;
  }

  function parsePrice(course) {
    var amountValue = parseNumericPrice(course && course.price);
    var amount = amountValue === null ? '' : formatPriceNumber(amountValue);
    if (!amount) return null;

    return {
      amount: amount,
      currency: '₽'
    };
  }

  function buildPriceBlock(course) {
    var parsed = parsePrice(course);
    if (!parsed) return '';

    return (
      '<div class="div flex-wrapper">' +
      '<div class="div schedule-price">' +
      '<div class="text text-paragraph-medium text-weight-bold"><span class="text-block-wrap-div">' + escapeHtml(parsed.amount) + '</span></div>' +
      '<div class="text text-paragraph-medium text-weight-bold"><span class="text-block-wrap-div">' + escapeHtml(parsed.currency) + '</span></div>' +
      '</div>' +
      '</div>'
    );
  }

  function buildDateCard(course) {
    var date = parseDate(course.date);
    if (!date) return '';
    var dayLabel = String(course && course.day || '').trim();
    var dateLabel = String(course && course.dateLabel || '').trim();

    var subtitleClass = course.comment ? 'text caption-small text-color-violet-copy' : 'text caption-small text-color-violet-copy not-active';

    return (
      '<a href="' + escapeHtml(course.courseLink || '#') + '" target="_blank" class="link-block schedule-link">' +
      '<div class="div schedule-item">' +
      '<div class="div schedule-item-date">' +
      '<div class="div ' + statusClass(course.courseStatus) + '">' +
      '<div class="text"><span class="text-block-wrap-div">' + escapeHtml(course.courseStatus || 'Идет набор') + '</span></div>' +
      '</div>' +
      '<div class="div schedule-date-wrapper">' +
      '<div class="text heading-style-h4 text-weight-bold"><span class="text-block-wrap-div">' + escapeHtml(dayLabel) + '</span></div>' +
      '<div class="text caption-small text-color-violet"><span class="text-block-wrap-div">' + escapeHtml(dateLabel) + '</span></div>' +
      '</div>' +
      '</div>' +
      '<div class="div schedule-item-info">' +
      '<div class="div schedule-info-text-wrapper">' +
      '<div class="text text-paragraph-medium text-weight-bold"><span class="text-block-wrap-div">' + escapeHtml(course.title) + '</span></div>' +
      '<div class="' + subtitleClass + '"><span class="text-block-wrap-div">' + escapeHtml(course.comment) + '</span></div>' +
      '</div>' +
      '<div class="div schedule-info-tag-wrapper">' +
      '<div class="div inner-tag-wrapper">' +
      buildInfoTag('calendar-icon.svg', course.studyDays) +
      buildHoursTag(course) +
      '</div>' +
      buildInfoTag('document-verified-icon.svg', course.educationDocument) +
      '</div>' +
      '</div>' +
      '<div class="div schedule-item-price">' +
      buildPriceBlock(course) +
      '<div class="div schedule-link-button"><div class="text"><span class="text-block-wrap-div">Записаться</span></div></div>' +
      '</div>' +
      '</div>' +
      '</a>'
    );
  }

  function buildWaitCard(course) {
    var subtitleClass = course.comment ? 'text caption-small text-color-violet-copy' : 'text caption-small text-color-violet-copy not-active';

    return (
      '<a href="' + escapeHtml(course.courseLink || '#') + '" target="_blank" class="link-block schedule-link">' +
      '<div class="div schedule-item-wait">' +
      '<div class="div schedule-item-info">' +
      '<div class="div schedule-info-text-wrapper">' +
      '<div class="text text-paragraph-medium text-weight-bold"><span class="text-block-wrap-div">' + escapeHtml(course.title) + '</span></div>' +
      '<div class="' + subtitleClass + '"><span class="text-block-wrap-div">' + escapeHtml(course.comment) + '</span></div>' +
      '</div>' +
      '</div>' +
      '<div class="div schedule-item-price">' +
      '<div class="div schedule-link-button"><div class="text"><span class="text-block-wrap-div">Записаться</span></div></div>' +
      '</div>' +
      '</div>' +
      '</a>'
    );
  }

  function monthSlug(index) {
    return 'month-' + String(index + 1);
  }

  function startOfToday() {
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function isPastCourseAvailable(course, parsedDate, today) {
    if (!parsedDate || parsedDate >= today) return false;
    if (!course || !course.courseLink || course.courseLink === '#') return false;

    var courseStatus = String(course.courseStatus || '').toLowerCase();
    if (courseStatus.indexOf('sold') !== -1) return false;
    if (courseStatus.indexOf('заверш') !== -1) return false;

    return true;
  }

  function sortCoursesInMonth(a, b) {
    var dateA = parseDate(a.date);
    var dateB = parseDate(b.date);

    if (dateA && dateB && dateA.getTime() !== dateB.getTime()) {
      return dateA.getTime() - dateB.getTime();
    }
    if (dateA && !dateB) return -1;
    if (!dateA && dateB) return 1;

    return String(a.title || '').localeCompare(String(b.title || ''), 'ru');
  }

  function orderMonthEntries(entries) {
    var currentMonthIndex = new Date().getMonth();
    var today = startOfToday();
    var monthsWithPastBuyable = [];
    var regularMonths = [];

    entries.forEach(function (entry) {
      var monthIndex = entry[0];
      var courses = entry[1];

      var hasPastBuyable = monthIndex < currentMonthIndex && courses.some(function (course) {
        return isPastCourseAvailable(course, parseDate(course.date), today);
      });

      if (hasPastBuyable) {
        monthsWithPastBuyable.push(entry);
      } else {
        regularMonths.push(entry);
      }
    });

    // Show closest past months first when there are still purchasable courses.
    monthsWithPastBuyable.sort(function (a, b) {
      return b[0] - a[0];
    });

    // Regular order starts from the current month.
    regularMonths.sort(function (a, b) {
      var aOffset = (a[0] - currentMonthIndex + 12) % 12;
      var bOffset = (b[0] - currentMonthIndex + 12) % 12;
      return aOffset - bOffset;
    });

    return monthsWithPastBuyable.concat(regularMonths);
  }

  function renderCourses(courses) {
    var monthMap = new Map();
    var waitlist = [];

    courses.forEach(function (course) {
      var parsedDate = parseDate(course.date);
      if (course.waitlist || !parsedDate) {
        waitlist.push(course);
        return;
      }

      var monthIndex = parsedDate.getMonth();
      if (!monthMap.has(monthIndex)) {
        monthMap.set(monthIndex, []);
      }
      monthMap.get(monthIndex).push(course);
    });

    var sortedMonths = orderMonthEntries(
      Array.from(monthMap.entries()).map(function (entry) {
        return [entry[0], entry[1].slice().sort(sortCoursesInMonth)];
      })
    );

    setHtml(tabsContainer, sortedMonths
      .map(function (entry) {
        var monthIndex = entry[0];
        return (
          '<a href="#' + monthSlug(monthIndex) + '" class="link-block schedule-tab-link">' +
          '<div class="text"><span class="text-block-wrap-div">' + MONTHS_NOMINATIVE[monthIndex] + '</span></div>' +
          '</a>'
        );
      })
      .join(''));

    setHtml(monthsContainer, sortedMonths
      .map(function (entry) {
        var monthIndex = entry[0];
        var cards = entry[1].map(buildDateCard).join('');

        return (
          '<div class="div schedule-component" id="' + monthSlug(monthIndex) + '">' +
          '<div class="div schedule-links-component margin-24">' +
          '<div class="text text-paragraph-large text-weight-bold tab-heading"><span class="text-block-wrap-div">' + MONTHS_NOMINATIVE[monthIndex] + '</span></div>' +
          '<div class="div schedule-links-wrapper">' + cards + '</div>' +
          '</div>' +
          '</div>'
        );
      })
      .join(''));

    setHtml(waitlistContainer, waitlist.map(buildWaitCard).join(''));

    if (!sortedMonths.length) {
      setHtml(monthsContainer, buildTextState('Курсы с датой пока не добавлены.'));
    }

    if (!waitlist.length) {
      setHtml(waitlistContainer, buildTextState('Лист ожидания пока пуст.'));
    }
  }

  async function loadCourses() {
    var response = await fetch('/api/courses-feed', {
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }

    var payload = await response.json();
    var items = Array.isArray(payload.data) ? payload.data : [];
    return items.map(toCourse);
  }

  function renderLoadingState() {
    setHtml(monthsContainer, buildTextState('Загружаем курсы...'));
  }

  function renderErrorState() {
    setHtml(monthsContainer, buildTextState('Не удалось загрузить курсы из БД.'));
    setHtml(waitlistContainer, '');
    setHtml(tabsContainer, '');
  }

  async function init() {
    if (!hasScheduleContainers()) return;

    renderLoadingState();

    try {
      var courses = await loadCourses();
      renderCourses(courses);
    } catch (error) {
      renderErrorState();
      console.error(error);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
