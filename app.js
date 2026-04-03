const MONTH_ORDER = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь"
];

const state = {
  selectedMonth: "all"
};

const data = window.SCHEDULE_DATA || { months: {}, undated: [] };

const availableMonths = Object.keys(data.months)
  .filter((month) => Array.isArray(data.months[month]) && data.months[month].length > 0)
  .sort((a, b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b));

const filtersEl = document.getElementById("monthFilters");
const monthsContainerEl = document.getElementById("monthsContainer");
const undatedContainerEl = document.getElementById("undatedContainer");

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function getStatusTone(status) {
  if (/ид[её]т\s+набор/i.test(status)) return "is-open";
  return "";
}

function parsePrice(priceRaw) {
  const text = cleanText(priceRaw);
  if (!text) return { discount: "", amount: "" };

  const discountMatch = text.match(/^(-\d+%)\s+(.+)$/);
  let discount = "";
  let amount = text;

  if (discountMatch) {
    discount = discountMatch[1];
    amount = discountMatch[2];
  }

  if (/\d/.test(amount) && !/[₽$€£]/.test(amount)) {
    amount = `${amount} ₽`;
  }

  return { discount, amount };
}

function createNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function renderFilters() {
  filtersEl.innerHTML = "";

  const allButton = createNode("button", `filter-btn ${state.selectedMonth === "all" ? "is-active" : ""}`, "Все месяцы");
  allButton.type = "button";
  allButton.addEventListener("click", () => {
    state.selectedMonth = "all";
    render();
  });
  filtersEl.append(allButton);

  for (const month of availableMonths) {
    const count = data.months[month].length;
    const button = createNode(
      "button",
      `filter-btn ${state.selectedMonth === month ? "is-active" : ""}`,
      `${month} (${count})`
    );

    button.type = "button";
    button.addEventListener("click", () => {
      state.selectedMonth = month;
      render();
    });
    filtersEl.append(button);
  }
}

function buildMeta(metaItems) {
  const metaWrap = createNode("div", "meta");

  for (const item of metaItems) {
    if (!item) continue;
    metaWrap.append(createNode("span", "meta-chip", item));
  }

  if (!metaWrap.children.length) return null;
  return metaWrap;
}

function buildCard(course, options = { undated: false }) {
  const card = createNode("a", `course-card ${options.undated ? "is-undated" : ""}`);
  card.href = cleanText(course.href) || "#";
  card.target = "_blank";
  card.rel = "noopener noreferrer";

  if (!options.undated) {
    const dateBox = createNode("div", "date-box");
    const status = cleanText(course.status);

    if (status) {
      dateBox.append(createNode("span", `status ${getStatusTone(status)}`, status));
    }

    if (course.day) {
      dateBox.append(createNode("div", "day", cleanText(course.day)));
    }

    if (course.dateLabel) {
      dateBox.append(createNode("div", "date-label", cleanText(course.dateLabel)));
    }

    card.append(dateBox);
  }

  const body = createNode("div", "card-body");
  body.append(createNode("h3", "card-title", cleanText(course.title)));

  if (course.subtitle) {
    body.append(createNode("p", "card-subtitle", cleanText(course.subtitle)));
  }

  const meta = buildMeta([
    cleanText(course.weekday),
    cleanText(course.hours),
    cleanText(course.certificate)
  ]);

  if (meta) body.append(meta);

  const cardFooter = createNode("div", "card-footer");
  const { discount, amount } = parsePrice(course.price);

  if (discount || amount) {
    const price = createNode("div", "price");
    if (discount) {
      price.append(createNode("span", "discount", discount));
    }
    if (amount) {
      price.append(createNode("span", "amount", amount));
    }
    cardFooter.append(price);
  } else {
    cardFooter.append(createNode("span", "price"));
  }

  cardFooter.append(createNode("span", "cta", cleanText(course.cta) || "Подробнее"));

  body.append(cardFooter);
  card.append(body);

  return card;
}

function renderMonths() {
  monthsContainerEl.innerHTML = "";

  const visibleMonths =
    state.selectedMonth === "all"
      ? availableMonths
      : availableMonths.filter((month) => month === state.selectedMonth);

  for (const month of visibleMonths) {
    const section = createNode("section", "month-section");
    section.id = `month-${month.toLowerCase()}`;

    section.append(createNode("h2", "month-title", month));

    const monthGrid = createNode("div", "month-grid");
    for (const course of data.months[month]) {
      monthGrid.append(buildCard(course));
    }

    section.append(monthGrid);
    monthsContainerEl.append(section);
  }

  if (!visibleMonths.length) {
    const empty = createNode("p", "empty-state", "По выбранному фильтру курсы не найдены.");
    monthsContainerEl.append(empty);
  }
}

function renderUndated() {
  undatedContainerEl.innerHTML = "";

  if (!data.undated.length) {
    undatedContainerEl.append(createNode("p", "empty-state", "Сейчас нет карточек без дат."));
    return;
  }

  for (const course of data.undated) {
    undatedContainerEl.append(buildCard(course, { undated: true }));
  }
}

function render() {
  renderFilters();
  renderMonths();
  renderUndated();
}

render();
