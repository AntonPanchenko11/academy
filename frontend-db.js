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

  var MONTHS_GENITIVE = [
    'Января',
    'Февраля',
    'Марта',
    'Апреля',
    'Мая',
    'Июня',
    'Июля',
    'Августа',
    'Сентября',
    'Октября',
    'Ноября',
    'Декабря'
  ];

  var WEEKDAYS_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

  var tabsContainer = document.getElementById('monthTabs');
  var monthsContainer = document.getElementById('monthsContainer');
  var waitlistContainer = document.getElementById('waitlistContainer');

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toCourse(row) {
    var src = row && row.attributes ? row.attributes : row || {};

    return {
      id: row && row.id ? row.id : src.id,
      title: src.title || '',
      publish: src.publish !== false,
      comment: src.comment || '',
      date: src.date || '',
      waitlist: src.waitlist === true,
      courseStatus: src.courseStatus || '',
      studyDays: src.studyDays || '',
      hours: src.hours,
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

  function dayText(date) {
    var day = date.getDate();
    return day < 10 ? '0' + day : String(day);
  }

  function monthDayText(date) {
    var month = MONTHS_GENITIVE[date.getMonth()];
    var day = date.getDay() === 0 ? 6 : date.getDay() - 1;
    return month + ', ' + WEEKDAYS_SHORT[day];
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

  function buildHoursTag(hours) {
    if (hours === null || hours === undefined || hours === '') return '';

    return (
      '<div class="div schedule-info-tag">' +
      '<div class="image schedule-tag-icon">' +
      '<img src="./assets/time-circle-icon.svg" alt="time-circle-icon" class="image__img">' +
      '</div>' +
      '<div class="div tag-text-wrapper">' +
      '<div class="text"><span class="text-block-wrap-div">' + escapeHtml(hours) + '</span></div>' +
      '<div class="text"><span class="text-block-wrap-div">ак. ч.</span></div>' +
      '</div>' +
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

    var subtitleClass = course.comment ? 'text caption-small text-color-violet-copy' : 'text caption-small text-color-violet-copy not-active';

    return (
      '<a href="' + escapeHtml(course.courseLink || '#') + '" target="_blank" class="link-block schedule-link">' +
      '<div class="div schedule-item">' +
      '<div class="div schedule-item-date">' +
      '<div class="div ' + statusClass(course.courseStatus) + '">' +
      '<div class="text"><span class="text-block-wrap-div">' + escapeHtml(course.courseStatus || 'Идет набор') + '</span></div>' +
      '</div>' +
      '<div class="div schedule-date-wrapper">' +
      '<div class="text heading-style-h4 text-weight-bold"><span class="text-block-wrap-div">' + dayText(date) + '</span></div>' +
      '<div class="text caption-small text-color-violet"><span class="text-block-wrap-div">' + monthDayText(date) + '</span></div>' +
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
      buildHoursTag(course.hours) +
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
    var published = courses.filter(function (course) {
      return course.publish;
    });

    var monthMap = new Map();
    var waitlist = [];

    published.forEach(function (course) {
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

    tabsContainer.innerHTML = sortedMonths
      .map(function (entry) {
        var monthIndex = entry[0];
        return (
          '<a href="#' + monthSlug(monthIndex) + '" class="link-block schedule-tab-link">' +
          '<div class="text"><span class="text-block-wrap-div">' + MONTHS_NOMINATIVE[monthIndex] + '</span></div>' +
          '</a>'
        );
      })
      .join('');

    monthsContainer.innerHTML = sortedMonths
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
      .join('');

    waitlistContainer.innerHTML = waitlist.map(buildWaitCard).join('');

    if (!sortedMonths.length) {
      monthsContainer.innerHTML = '<div class="text text-paragraph-medium"><span class="text-block-wrap-div">Курсы с датой пока не добавлены.</span></div>';
    }

    if (!waitlist.length) {
      waitlistContainer.innerHTML = '<div class="text text-paragraph-medium"><span class="text-block-wrap-div">Лист ожидания пока пуст.</span></div>';
    }
  }

  async function loadCourses() {
    var endpoints = [
      '/api/courses-feed',
      '/api/tilda/courses'
    ];

    var lastError = null;

    for (var i = 0; i < endpoints.length; i += 1) {
      try {
        var response = await fetch(endpoints[i], { headers: { Accept: 'application/json' } });
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }

        var payload = await response.json();
        var items = Array.isArray(payload.data) ? payload.data : [];
        return items.map(toCourse);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('Failed to load courses');
  }

  async function init() {
    monthsContainer.innerHTML = '<div class="text text-paragraph-medium"><span class="text-block-wrap-div">Загружаем курсы...</span></div>';

    try {
      var courses = await loadCourses();
      renderCourses(courses);
    } catch (error) {
      monthsContainer.innerHTML = '<div class="text text-paragraph-medium"><span class="text-block-wrap-div">Не удалось загрузить курсы из БД.</span></div>';
      waitlistContainer.innerHTML = '';
      tabsContainer.innerHTML = '';
      console.error(error);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
