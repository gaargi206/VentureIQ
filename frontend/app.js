const state = {
  tab: "Find",
  startups: [],
  total: 0,
  page: 1,
  pageSize: 25,
  hasMore: false,
  search: "",
  industry: "All",
  stage: "All",
  minScore: 0,
  minFunding: 0,
  minGrowth: 0,
  sort: "score",
  selected: null,
  scoring: null,
  meta: null,
  summary: null,
  analysis: null,
  watchlist: new Set(
    JSON.parse(localStorage.getItem("vq-watchlist") || "[]")
  ),
  watchItems: [],
};

const app = document.getElementById("app");

const iconMap = {
  Dashboard: "▦",
  Find: "⌕",
  Cmp: "⇄",
  Data: "◒",
  Watch: "★"
};

const tabs = ["Dashboard", "Find", "Cmp", "Data", "Watch"];

function esc(value) {
  return String(value ?? "").replace(
    /[&<>'"]/g,
    ch => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    }[ch])
  );
}

function num(value, digits = 1) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n.toFixed(digits).replace(/\.0+$/, "")
    : "—";
}

function money(value) {
  const n = Number(value);

  if (!Number.isFinite(n) || n === 0) {
    return "—";
  }

  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";

  if (abs >= 1e9) {
    return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  }

  if (abs >= 1e6) {
    return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  }

  if (abs >= 1e3) {
    return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  }

  return `${sign}$${Math.round(abs)}`;
}

function pct(value) {
  return value == null || value === ""
    ? "—"
    : `${num(value, 1)}%`;
}

function riskClass(level) {
  return level === "High"
    ? 'style="color:var(--red)"'
    : level === "Low"
      ? 'style="color:var(--blue)"'
      : "";
}

function firstLetter(name) {
  return (
    String(name || "?")
      .trim()
      .charAt(0)
      .toUpperCase() || "?"
  );
}

function avatarClass(startup) {
  const s = String(startup.startup_id || "");
  const n = Number((s.match(/\d+/) || [0])[0]);

  return `avatar ${
    ["", "alt1", "alt2", "alt3"][n % 4] || ""
  }`;
}

function saveWatchlist() {
  localStorage.setItem(
    "vq-watchlist",
    JSON.stringify([...state.watchlist])
  );
}

async function syncWatchItems() {
  const ids = [...state.watchlist];

  if (!ids.length) {
    state.watchItems = [];
    return;
  }

  const results = await Promise.all(
    ids.map(async id => {
      try {
        return toSummary(
          await api(
            `/api/startups/${encodeURIComponent(id)}`
          )
        );
      } catch {
        return null;
      }
    })
  );

  const live = results.filter(Boolean);

  const liveIds = new Set(
    live.map(x => x.startup_id)
  );

  state.watchlist = new Set(
    [...state.watchlist].filter(id =>
      liveIds.has(id)
    )
  );

  saveWatchlist();

  state.watchItems = live;
}

function toast(message, error = false) {
  const old = document.querySelector(".toast");

  if (old) {
    old.remove();
  }

  const el = document.createElement("div");

  el.className = `toast ${error ? "error" : ""}`;
  el.textContent = message;

  document.body.appendChild(el);

  setTimeout(() => el.remove(), 3200);
}

function formatApiError(
  detail,
  fallback = "Request failed"
) {
  if (detail == null) {
    return fallback;
  }

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map(item => {
        if (typeof item === "string") {
          return item;
        }

        if (
          item &&
          typeof item === "object"
        ) {
          const loc = Array.isArray(item.loc)
            ? item.loc.join(" → ")
            : "";

          const msg =
            item.msg ||
            item.message ||
            item.error ||
            JSON.stringify(item);

          return loc
            ? `${loc}: ${msg}`
            : msg;
        }

        return String(item);
      })
      .join("\n");
  }

  if (
    typeof detail === "object"
  ) {
    return (
      detail.message ||
      detail.error ||
      detail.msg ||
      detail.detail ||
      JSON.stringify(detail, null, 2)
    );
  }

  return String(detail);
}

async function api(
  path,
  options = {}
) {
  try {
    const response = await fetch(
      path,
      options
    );

    const body = await response
      .json()
      .catch(() => ({
        detail: "Invalid API response"
      }));

    if (!response.ok) {
      throw new Error(
        formatApiError(
          body?.detail,
          `Request failed (${response.status})`
        )
      );
    }

    return body;
  } catch (error) {
    if (
      error instanceof TypeError
    ) {
      throw new Error(
        "Cannot connect to VentureIQ API. Make sure the FastAPI server is running on port 8000."
      );
    }

    throw error;
  }
}

function setLoading(
  target,
  text = "Loading…"
) {
  target.innerHTML = `
    <div class="empty font-headline">
      ${esc(text)}
    </div>
  `;
}

async function boot() {
  try {
    [
      state.meta,
      state.scoring,
      state.summary
    ] = await Promise.all([
      api("/api/meta"),
      api("/api/scoring"),
      api("/api/summary")
    ]);

    await loadStartups(true);
    await syncWatchItems();
  } catch (err) {
    toast(err.message, true);
  }

  render();
}

async function loadStartups(
  reset = false
) {
  if (reset) {
    state.page = 1;
  }

  const params =
    new URLSearchParams({
      page: String(state.page),
      page_size: String(
        state.pageSize
      ),
      sort: state.sort
    });

  if (state.search.trim()) {
    params.set(
      "search",
      state.search.trim()
    );
  }

  if (state.industry !== "All") {
    params.set(
      "industry",
      state.industry
    );
  }

  if (state.stage !== "All") {
    params.set(
      "stage",
      state.stage
    );
  }

  if (state.minScore) {
    params.set(
      "min_score",
      String(state.minScore)
    );
  }

  if (state.minFunding) {
    params.set(
      "min_funding",
      String(state.minFunding)
    );
  }

  if (state.minGrowth) {
    params.set(
      "min_growth",
      String(state.minGrowth)
    );
  }

  const response =
    await api(
      `/api/startups?${params}`
    );

  state.startups = reset
    ? response.items
    : [
        ...state.startups,
        ...response.items
      ];

  state.total =
    response.total;

  state.hasMore =
    state.startups.length <
    state.total;

  state.meta =
    state.meta || {};

  return response;
}

function header() {
  return `
    <header class="topbar">
      <div class="topbar-inner">

        <button
          class="brand"
          data-action="home"
        >
          VQ<span>.</span>
        </button>

        <div class="top-actions">

          <button
            class="btn secondary"
            data-action="reset"
          >
            Reset
          </button>

          <button
            class="btn icon"
            data-action="upload"
            aria-label="Upload dataset"
          >
            +
          </button>

        </div>

      </div>
    </header>
  `;
}

function nav() {
  return `
    <nav class="nav">
      <div class="nav-inner">

        ${tabs
          .map(
            t => `
              <button
                data-tab="${t}"
                class="${
                  state.tab === t
                    ? "active"
                    : ""
                }"
              >

                <span class="nav-icon">
                  ${iconMap[t]}
                </span>

                ${
                  t === "Dashboard"
                    ? "Dash"
                    : t === "Find"
                      ? "Find"
                      : t
                }

              </button>
            `
          )
          .join("")}

      </div>
    </nav>
  `;
}

function pageShell(content) {
  return `
    ${header()}
    <main>
      ${content}
    </main>
    ${nav()}
  `;
}

function render() {
  let content = "";

  if (state.selected) {
    content =
      renderDetail(
        state.selected
      );
  } else if (
    state.tab === "Find"
  ) {
    content = renderFind();
  } else if (
    state.tab === "Dashboard"
  ) {
    content =
      renderDashboard();
  } else if (
    state.tab === "Cmp"
  ) {
    content =
      renderCompare();
  } else if (
    state.tab === "Data"
  ) {
    content =
      renderData();
  } else {
    content =
      renderWatch();
  }

  app.innerHTML =
    pageShell(content) +
    (
      state.uploadOpen
        ? uploadModal()
        : ""
    );

  bindEvents();
}

function renderFind() {
  const industries = [
    "All",
    ...(state.meta?.industries || [])
  ];

  const stages = [
    "All",
    ...(state.meta?.stages || [])
  ];

  const empty =
    !state.startups.length &&
    state.total === 0;

  return `
    <section>

      <div class="page-head">

        <div>
          <div class="eyebrow">
            VentureIQ Screener
          </div>

          <h1>
            Discover Startups
          </h1>
        </div>

        <div class="chip">
          ${state.total} LIVE
        </div>

      </div>

      <div class="search">

        <span class="icon">
          ⌕
        </span>

        <input
          id="search"
          value="${esc(state.search)}"
          placeholder="Search by name, keyword, or founder..."
        />

      </div>

      <div class="filters">

        ${industries
          .slice(0, 10)
          .map(
            x => `
              <button
                class="pill ${
                  state.industry === x
                    ? "active"
                    : ""
                }"
                data-industry="${esc(x)}"
              >
                ${
                  x === "All"
                    ? "Sector: All"
                    : esc(x)
                }
              </button>
            `
          )
          .join("")}

        ${stages
          .slice(0, 8)
          .map(
            x => `
              <button
                class="pill ${
                  state.stage === x
                    ? "active"
                    : ""
                }"
                data-stage="${esc(x)}"
              >
                ${
                  x === "All"
                    ? "Stage: All"
                    : esc(x)
                }
              </button>
            `
          )
          .join("")}

        <button
          class="pill ${
            state.minScore
              ? "blue"
              : ""
          }"
          data-filter-score
        >
          VIQ Score:
          ${
            state.minScore
              ? `${state.minScore}+`
              : "All"
          }
        </button>

        <button
          class="pill ${
            state.minFunding
              ? "yellow"
              : ""
          }"
          data-filter-funding
        >
          Funding:
          ${
            state.minFunding
              ? `${
                  state.minFunding /
                  1e6
                }M+`
              : "All"
          }
        </button>

        <button
          class="pill ${
            state.minGrowth
              ? "yellow"
              : ""
          }"
          data-filter-growth
        >
          Growth:
          ${
            state.minGrowth
              ? `${state.minGrowth}%+`
              : "All"
          }
        </button>

      </div>

      <div class="toolbar">

        <span>
          Showing
          ${state.startups.length}
          of
          ${state.total}
          matches
        </span>

        <span>

          Sort

          <select id="sort">

            <option
              value="score"
              ${
                state.sort ===
                "score"
                  ? "selected"
                  : ""
              }
            >
              Most Relevant
            </option>

            <option
              value="growth"
              ${
                state.sort ===
                "growth"
                  ? "selected"
                  : ""
              }
            >
              Growth
            </option>

            <option
              value="funding"
              ${
                state.sort ===
                "funding"
                  ? "selected"
                  : ""
              }
            >
              Funding
            </option>

            <option
              value="name"
              ${
                state.sort ===
                "name"
                  ? "selected"
                  : ""
              }
            >
              Name
            </option>

          </select>

        </span>

      </div>

      ${
        empty
          ? `
            <div
              class="empty section"
            >

              <h2>
                Your workspace is clean.
              </h2>

              <p class="muted small">
                Upload a startup dataset
                to populate VentureIQ.
                No sample companies are bundled.
              </p>

              <button
                class="btn accent"
                data-action="upload"
              >
                Upload Dataset
              </button>

            </div>
          `
          : `
            <div
              class="grid two section"
            >
              ${state.startups
                .map(renderCard)
                .join("")}
            </div>
          `
      }

      ${
        state.hasMore
          ? `
            <div class="section">

              <button
                class="btn secondary"
                style="width:100%"
                data-action="load-more"
              >
                Load More Startups
                (
                ${
                  state.total -
                  state.startups.length
                }
                remaining)
              </button>

            </div>
          `
          : ""
      }

    </section>
  `;
}

function renderCard(s) {
  const saved =
    state.watchlist.has(
      s.startup_id
    );

  return `
    <article
      class="startup-card card clickable"
      data-startup="${esc(
        s.startup_id
      )}"
    >

      <div class="startup-top">

        <div class="startup-id">

          <div class="${avatarClass(
            s
          )}">
            ${esc(
              firstLetter(s.name)
            )}
          </div>

          <div
            style="min-width:0"
          >

            <div class="startup-name">

              ${esc(s.name)}

              <span class="tag">
                ${esc(
                  s.industry ||
                    "Unclassified"
                )}
              </span>

            </div>

            <p class="startup-desc">
              ${esc(
                s.business_model ||
                  "Investment screening profile with deterministic VentureIQ scoring."
              )}
            </p>

          </div>

        </div>

        <button
          class="bookmark ${
            saved ? "saved" : ""
          }"
          data-watch="${esc(
            s.startup_id
          )}"
          title="${
            saved
              ? "Remove from watchlist"
              : "Add to watchlist"
          }"
        >
          ${
            saved
              ? "★"
              : "☆"
          }
        </button>

      </div>

      <div class="metrics">

        <div class="metric">
          <label>
            Stage
          </label>
          <strong>
            ${esc(
              s.stage || "—"
            )}
          </strong>
        </div>

        <div class="metric">
          <label>
            Raised
          </label>
          <strong>
            ${money(
              s.funding_raised
            )}
          </strong>
        </div>

        <div class="metric">
          <label>
            Growth
          </label>
          <strong class="growth">
            ${pct(
              s.revenue_growth
            )}
          </strong>
        </div>

        <div class="metric score">
          <label>
            VIQ Score
          </label>
          <strong>
            ${num(
              s.attractiveness_score
            )}
          </strong>
        </div>

      </div>

      <div class="meta-row">
        <span>
          Category:
          <strong>
            ${esc(
              s.investment_category
            )}
          </strong>
        </span>

        <span>
          ${esc(
            s.location ||
              "Location unavailable"
          )}
        </span>
      </div>

    </article>
  `;
}

function renderDashboard() {
  const s =
    state.summary || {
      startup_count: 0,
      average_viq: 0,
      median_viq: 0,
      risk_levels: {
        Low: 0,
        Medium: 0,
        High: 0
      },
      top_opportunities: [],
      industries: {}
    };

  const count =
    s.startup_count || 0;

  return `
    <section>

      <div class="page-head">

        <div>
          <div class="eyebrow">
            Portfolio Intelligence
          </div>

          <h1>
            Dashboard
          </h1>
        </div>

        <div class="chip">
          ${count} STARTUPS
        </div>

      </div>

      ${
        count
          ? `

            <div class="grid four">

              <div class="card kpi">
                <div class="eyebrow">
                  STARTUPS
                </div>
                <strong>
                  ${count}
                </strong>
              </div>

              <div class="card kpi">
                <div class="eyebrow">
                  AVG VIQ
                </div>
                <strong>
                  ${num(
                    s.average_viq
                  )}
                </strong>
              </div>

              <div class="card kpi">
                <div class="eyebrow">
                  HIGH RISK
                </div>

                <strong
                  style="color:var(--red)"
                >
                  ${
                    s.risk_levels
                      ?.High || 0
                  }
                </strong>
              </div>

              <div class="card kpi">
                <div class="eyebrow">
                  MEDIAN VIQ
                </div>

                <strong>
                  ${num(
                    s.median_viq
                  )}
                </strong>
              </div>

            </div>

            <div class="grid two section">

              <div
                class="card"
                style="padding:18px"
              >

                <h2>
                  Risk mix
                </h2>

                ${
                  [
                    "Low",
                    "Medium",
                    "High"
                  ]
                    .map(level => {
                      const n =
                        s.risk_levels
                          ?.[
                            level
                          ] || 0;

                      return `
                        <div
                          class="section"
                        >

                          <div
                            class="list-row"
                          >

                            <span>
                              ${level}
                              risk
                            </span>

                            <b
                              ${riskClass(
                                level
                              )}
                            >
                              ${n}
                            </b>

                          </div>

                          <div
                            class="bar"
                          >
                            <span
                              style="width:${
                                count
                                  ? Math.round(
                                      (n /
                                        count) *
                                        100
                                    )
                                  : 0
                              }%"
                            ></span>
                          </div>

                        </div>
                      `;
                    })
                    .join("")
                }

              </div>

              <div
                class="card"
                style="padding:18px"
              >

                <h2>
                  Top opportunities
                </h2>

                ${
                  s.top_opportunities
                    .length
                    ? s.top_opportunities
                        .map(
                          (
                            x,
                            i
                          ) => `
                            <div
                              class="list-row clickable"
                              data-startup="${esc(
                                x.startup_id
                              )}"
                            >

                              <span>
                                <b>
                                  ${
                                    i + 1
                                  }.
                                </b>

                                ${esc(
                                  x.name
                                )}
                              </span>

                              <b>
                                ${num(
                                  x.attractiveness_score
                                )}
                              </b>

                            </div>
                          `
                        )
                        .join("")
                    : `
                      <p
                        class="muted small section"
                      >
                        No scored startups yet.
                      </p>
                    `
                }

              </div>

            </div>

            <div
              class="card section"
              style="padding:18px"
            >

              <h2>
                Sector mix
              </h2>

              <div
                class="grid three section"
              >

                ${
                  Object.entries(
                    s.industries || {}
                  )
                    .sort(
                      (a, b) =>
                        b[1] - a[1]
                    )
                    .slice(0, 6)
                    .map(
                      ([k, v]) => `
                        <div
                          class="soft"
                          style="padding:12px"
                        >

                          <div
                            class="tiny muted"
                          >
                            ${esc(k)}
                          </div>

                          <div
                            style="
                              font:700 22px Space Grotesk;
                              margin-top:4px
                            "
                          >
                            ${v}
                          </div>

                        </div>
                      `
                    )
                    .join("")
                }

              </div>

            </div>

          `
          : `

            <div class="empty">

              <h2>
                No portfolio data yet.
              </h2>

              <p class="muted small">
                Start by uploading a dataset.
              </p>

              <button
                class="btn accent"
                data-action="upload"
              >
                Upload Dataset
              </button>

            </div>

          `
      }

    </section>
  `;
}

function renderCompare() {
  const selectable =
    state.startups.slice(
      0,
      100
    );

  if (!selectable.length) {
    return `
      <section>

        <div class="page-head">

          <div>
            <div class="eyebrow">
              Decision Workspace
            </div>

            <h1>
              Compare
            </h1>
          </div>

        </div>

        <div class="empty">

          <h2>
            Nothing to compare.
          </h2>

          <p class="muted small">
            Upload a dataset,
            then select up to
            three startups.
          </p>

          <button
            class="btn accent"
            data-action="upload"
          >
            Upload Dataset
          </button>

        </div>

      </section>
    `;
  }

  const selectedIds =
    state.compareIds || [];

  const chosen =
    selectedIds
      .map(id =>
        selectable.find(
          s =>
            s.startup_id === id
        )
      )
      .filter(Boolean);

  return `
    <section>

      <div class="page-head">

        <div>
          <div class="eyebrow">
            Decision Workspace
          </div>

          <h1>
            Compare
          </h1>
        </div>

        <div class="row-actions">

          <button
            class="btn secondary"
            data-action="clear-compare"
          >
            Clear
          </button>

        </div>

      </div>

      <div
        class="card"
        style="padding:14px"
      >

        <div class="grid three">

          ${selectable
            .map(
              s => `
                <label
                  class="soft"
                  style="
                    padding:10px;
                    display:flex;
                    align-items:center;
                    gap:9px;
                    font-size:12px
                  "
                >

                  <input
                    type="checkbox"
                    data-compare="${esc(
                      s.startup_id
                    )}"
                    ${
                      selectedIds.includes(
                        s.startup_id
                      )
                        ? "checked"
                        : ""
                    }
                  >

                  ${esc(s.name)}

                  <span class="muted">
                    (
                    ${num(
                      s.attractiveness_score
                    )}
                    )
                  </span>

                </label>
              `
            )
            .join("")}

        </div>

        <div
          class="tiny muted section"
        >
          Select up to 3 startups.
          The compare table updates
          immediately.
        </div>

      </div>

      ${
        chosen.length
          ? `

            <div
              class="card section"
              style="
                padding:0;
                overflow:auto
              "
            >

              <table
                class="compare-table"
              >

                <thead>

                  <tr>

                    <th>
                      Metric
                    </th>

                    ${chosen
                      .map(
                        s => `
                          <th>
                            ${esc(
                              s.name
                            )}
                          </th>
                        `
                      )
                      .join("")}

                  </tr>

                </thead>

                <tbody>

                  ${
                    [
                      [
                        "VIQ Score",
                        s =>
                          num(
                            s.attractiveness_score
                          )
                      ],
                      [
                        "Risk",
                        s =>
                          s.risk_level
                      ],
                      [
                        "Industry",
                        s =>
                          s.industry
                      ],
                      [
                        "Stage",
                        s =>
                          s.stage ||
                          "—"
                      ],
                      [
                        "Funding Raised",
                        s =>
                          money(
                            s.funding_raised
                          )
                      ],
                      [
                        "Revenue Growth",
                        s =>
                          pct(
                            s.revenue_growth
                          )
                      ],
                      [
                        "Customers",
                        s =>
                          num(
                            s.customers,
                            0
                          )
                      ],
                      [
                        "Category",
                        s =>
                          s.investment_category
                      ]
                    ]
                      .map(
                        ([k, fn]) => `
                          <tr>

                            <th>
                              ${k}
                            </th>

                            ${chosen
                              .map(
                                s => `
                                  <td>
                                    ${esc(
                                      fn(
                                        s
                                      )
                                    )}
                                  </td>
                                `
                              )
                              .join("")}

                          </tr>
                        `
                      )
                      .join("")
                  }

                </tbody>

              </table>

            </div>

          `
          : `

            <div
              class="empty section"
            >
              Choose two or three
              startups above.
            </div>

          `
      }

    </section>
  `;
}

function renderData() {
  const dq =
    state.meta?.data_quality ||
    {};

  const pi =
    state.analysis
      ?.pitch_intelligence;

  const weights =
    state.scoring?.weights ||
    {};

  return `
    <section>

      <div class="page-head">

        <div>
          <div class="eyebrow">
            Scoring Model
          </div>

          <h1>
            Data & Method
          </h1>
        </div>

        <button
          class="btn blue"
          data-action="api-docs"
        >
          API Docs
        </button>

      </div>

      <div class="grid four">

        <div class="card kpi">
          <div class="eyebrow">
            ROWS
          </div>
          <strong>
            ${dq.rows || 0}
          </strong>
        </div>

        <div class="card kpi">
          <div class="eyebrow">
            COLUMNS
          </div>
          <strong>
            ${dq.columns || 0}
          </strong>
        </div>

        <div class="card kpi">
          <div class="eyebrow">
            MISSING
          </div>
          <strong>
            ${dq.missing_cells || 0}
          </strong>
        </div>

        <div class="card kpi">
          <div class="eyebrow">
            DUPLICATES
          </div>
          <strong>
            ${dq.duplicate_rows || 0}
          </strong>
        </div>

      </div>

      <div class="grid two section">

        <div
          class="card"
          style="padding:18px"
        >

          <h2>
            VIQ weighting
          </h2>

          <div
            class="weights section"
          >

            ${Object.entries(
              weights
            )
              .map(
                ([k, v]) => `
                  <div
                    class="weight-row"
                  >

                    <span>
                      ${esc(k)}
                    </span>

                    <div
                      class="bar"
                    >
                      <span
                        style="width:${
                          Math.round(
                            v * 1000
                          ) / 10
                        }%"
                      ></span>
                    </div>

                    <b>
                      ${Math.round(
                        v * 100
                      )}%
                    </b>

                  </div>
                `
              )
              .join("")}

          </div>

        </div>

        <div
          class="card"
          style="padding:18px"
        >

          <h2>
            Active dataset
          </h2>

          <div
            class="section small"
          >

            <div
              class="list-row"
            >
              <span>
                Workspace
              </span>

              <b>
                ${
                  state.meta
                    ?.workspace_state ||
                  "empty"
                }
              </b>
            </div>

            <div
              class="list-row"
            >
              <span>
                Rows analyzed
              </span>

              <b>
                ${
                  state.meta
                    ?.rows_analyzed ||
                  0
                }
              </b>
            </div>

            <div
              class="list-row"
            >
              <span>
                Format support
              </span>

              <b>
                CSV / XLSX / XLS
              </b>
            </div>

            <div
              class="list-row"
            >
              <span>
                Pitch decks
              </span>

              <b>
                PDF / PPTX
              </b>
            </div>

          </div>

        </div>

      </div>

      <div
        class="card section"
        style="padding:18px"
      >

        <h2>
          Dataset columns
        </h2>

        <div class="filters">

          ${
            (
              state.meta
                ?.columns ||
              []
            )
              .map(
                c => `
                  <span class="pill">
                    ${esc(c)}
                  </span>
                `
              )
              .join("") ||
            `
              <span
                class="muted small"
              >
                No dataset uploaded.
              </span>
            `
          }

        </div>

      </div>

      ${
        pi
          ? `
            <div
              class="card section"
              style="padding:18px"
            >

              <h2>
                Latest pitch intelligence
              </h2>

              <div
                class="grid three section"
              >

                <div
                  class="soft"
                  style="padding:12px"
                >

                  <div class="eyebrow">
                    PITCH SCORE
                  </div>

                  <strong
                    style="
                      font:700 28px Space Grotesk
                    "
                  >
                    ${num(
                      pi.pitch_analysis
                        ?.overall_pitch_score
                    )}
                  </strong>

                </div>

                <div
                  class="soft"
                  style="padding:12px"
                >

                  <div class="eyebrow">
                    CONSISTENCY
                  </div>

                  <strong
                    style="
                      font:700 28px Space Grotesk
                    "
                  >
                    ${
                      pi
                        .consistency_check
                        ?.consistency_score ==
                      null
                        ? "—"
                        : `${num(
                            pi
                              .consistency_check
                              .consistency_score
                          )}%`
                    }
                  </strong>

                </div>

                <div
                  class="soft"
                  style="padding:12px"
                >

                  <div class="eyebrow">
                    DECK
                  </div>

                  <strong
                    style="
                      font:700 16px Space Grotesk
                    "
                  >
                    ${esc(
                      pi.deck
                        ?.file_name ||
                        "—"
                    )}
                  </strong>

                </div>

              </div>

            </div>
          `
          : ""
      }

    </section>
  `;
}

function renderWatch() {
  const saved =
    state.watchItems;

  return `
    <section>

      <div class="page-head">

        <div>
          <div class="eyebrow">
            Personal List
          </div>

          <h1>
            Watchlist
          </h1>
        </div>

        <div class="chip">
          ${saved.length} SAVED
        </div>

      </div>

      ${
        saved.length
          ? `
            <div class="grid two">
              ${saved
                .map(renderCard)
                .join("")}
            </div>
          `
          : `
            <div class="empty">

              <h2>
                Your watchlist is empty.
              </h2>

              <p class="muted small">
                Use the star on any
                startup in Find to
                save it here.
              </p>

              <button
                class="btn accent"
                data-tab="Find"
              >
                Discover Startups
              </button>

            </div>
          `
      }

    </section>
  `;
}

function renderDetail(s) {
  const raw =
    state.analysis?.startups?.find(
      x =>
        String(x.Startup_ID) ===
        String(s.startup_id)
    ) || null;

  const score =
    raw?.score || {
      attractiveness_score:
        s.attractiveness_score,
      risk_score:
        s.risk_score,
      risk_level:
        s.risk_level,
      investment_category:
        s.investment_category,
      category_scores: [],
      red_flags: [],
      completeness: 0
    };

  const fields = [
    [
      "Revenue",
      money(
        raw?.Revenue ??
          s.revenue
      )
    ],
    [
      "Funding Raised",
      money(
        raw?.Funding_Raised ??
          s.funding_raised
      )
    ],
    [
      "Revenue Growth",
      pct(
        raw?.Revenue_Growth ??
          s.revenue_growth
      )
    ],
    [
      "Customers",
      num(
        raw?.Customers ??
          s.customers,
        0
      )
    ],
    [
      "Cash Runway",
      raw?.Cash_Runway != null
        ? `${num(
            raw.Cash_Runway
          )} mo`
        : "—"
    ],
    [
      "Valuation",
      money(raw?.Valuation)
    ],
    [
      "Team Size",
      num(
        raw?.Team_Size,
        0
      )
    ],
    [
      "Retention",
      pct(raw?.Retention)
    ]
  ];

  return `
    <section>

      <div
        class="row-actions"
        style="margin-bottom:14px"
      >

        <button
          class="btn secondary"
          data-action="back"
        >
          ← Back
        </button>

        <button
          class="btn ${
            state.watchlist.has(
              s.startup_id
            )
              ? "blue"
              : "secondary"
          }"
          data-watch="${esc(
            s.startup_id
          )}"
        >
          ${
            state.watchlist.has(
              s.startup_id
            )
              ? "★ Saved"
              : "☆ Save"
          }
        </button>

      </div>

      <div class="detail-layout">

        <div
          class="card detail-main"
        >

          <div class="eyebrow">
            ${esc(
              s.industry
            )}
          </div>

          <h1>
            ${esc(s.name)}
          </h1>

          <p class="muted small">
            ${esc(
              s.location ||
                "Location unavailable"
            )}
            ·
            ${esc(
              s.stage ||
                "Stage unavailable"
            )}
          </p>

          <div
            class="score-hero section"
          >

            <div>

              <div class="eyebrow">
                VentureIQ Score
              </div>

              <div class="number">
                ${num(
                  score.attractiveness_score
                )}
              </div>

            </div>

            <div
              style="text-align:right"
            >

              <div class="chip">
                ${esc(
                  score.investment_category
                )}
              </div>

              <div
                class="small"
                style="margin-top:7px"
                ${riskClass(
                  score.risk_level
                )}
              >
                Risk:
                <b>
                  ${esc(
                    score.risk_level
                  )}
                </b>
              </div>

            </div>

          </div>

          <div class="grid four">

            ${fields
              .map(
                ([k, v]) => `
                  <div class="metric">

                    <label>
                      ${k}
                    </label>

                    <strong>
                      ${esc(v)}
                    </strong>

                  </div>
                `
              )
              .join("")}

          </div>

          <div class="section">

            <h2>
              Category scores
            </h2>

            <div
              class="weights section"
            >

              ${
                (
                  score.category_scores ||
                  []
                )
                  .map(
                    x => `
                      <div
                        class="weight-row"
                      >

                        <span>
                          ${esc(
                            x.category
                          )}
                        </span>

                        <div
                          class="bar"
                        >
                          <span
                            style="width:${Math.max(
                              0,
                              Math.min(
                                100,
                                x.score
                              )
                            )}%"
                          ></span>
                        </div>

                        <b>
                          ${num(
                            x.score
                          )}
                        </b>

                      </div>
                    `
                  )
                  .join("") ||
                `
                  <p class="muted small">
                    No category breakdown
                    available.
                  </p>
                `
              }

            </div>

          </div>

        </div>

        <aside
          class="card detail-side"
        >

          <h2>
            Risk & diligence
          </h2>

          <div class="list-row">

            <span>
              Risk score
            </span>

            <b
              ${riskClass(
                score.risk_level
              )}
            >
              ${num(
                score.risk_score
              )}
            </b>

          </div>

          <div class="list-row">

            <span>
              Completeness
            </span>

            <b>
              ${num(
                score.completeness
              )}%
            </b>

          </div>

          ${
            (
              score.red_flags ||
              []
            ).length
              ? `
                <div class="section">

                  <div class="eyebrow">
                    Red flags
                  </div>

                  ${score.red_flags
                    .map(
                      f => `
                        <div
                          class="flag"
                        >
                          ${esc(f)}
                        </div>
                      `
                    )
                    .join("")}

                </div>
              `
              : `
                <div
                  class="notice section"
                >
                  No deterministic
                  red flags were
                  triggered by the
                  current scoring
                  inputs.
                </div>
              `
          }

          <div class="section">

            <div class="eyebrow">
              Raw dataset fields
            </div>

            ${
              raw
                ? Object.entries(
                    raw
                  )
                    .filter(
                      ([k]) =>
                        k !== "score"
                    )
                    .slice(0, 14)
                    .map(
                      ([k, v]) => `
                        <div
                          class="list-row"
                        >

                          <span>
                            ${esc(k)}
                          </span>

                          <b>
                            ${esc(
                              v == null
                                ? "—"
                                : v
                            )}
                          </b>

                        </div>
                      `
                    )
                    .join("")
                : ""
            }

          </div>

        </aside>

      </div>

    </section>
  `;
}

function uploadModal() {
  return `
    <div class="modal-wrap">

      <div class="modal">

        <div class="modal-head">

          <div>

            <div class="eyebrow">
              Workspace Import
            </div>

            <h2>
              Analyze Dataset
            </h2>

          </div>

          <button
            class="close"
            data-action="close-upload"
          >
            ×
          </button>

        </div>

        <p class="muted small">
          Upload your own startup dataset.
          The app starts clean and the
          upload replaces the active
          workspace.
        </p>

        <div class="drop">

          <strong>
            Startup dataset
          </strong>

          <div class="tiny muted">
            CSV, XLSX or XLS · max
            ${
              state.meta
                ?.max_upload_mb ||
              25
            }
            MB
          </div>

          <input
            id="dataset-file"
            class="file-input"
            type="file"
            accept=".csv,.xlsx,.xls"
          />

        </div>

        <div class="drop">

          <strong>
            Pitch deck
            <span class="muted">
              (optional)
            </span>
          </strong>

          <div class="tiny muted">
            PDF or PPTX
          </div>

          <input
            id="deck-file"
            class="file-input"
            type="file"
            accept=".pdf,.pptx"
          />

        </div>

        <div id="upload-error"></div>

        <button
          class="btn accent section"
          style="width:100%"
          data-action="submit-upload"
        >
          Run VentureIQ Analysis
        </button>

      </div>

    </div>
  `;
}

function bindEvents() {

  document
    .querySelectorAll("[data-tab]")
    .forEach(el => {

      el.addEventListener(
        "click",
        async () => {

          state.tab =
            el.dataset.tab;

          state.selected = null;

          render();
        }
      );

    });

  document
    .querySelectorAll("[data-startup]")
    .forEach(el => {

      el.addEventListener(
        "click",
        async e => {

          if (
            e.target.closest(
              "[data-watch]"
            )
          ) {
            return;
          }

          const id =
            el.dataset.startup;

          await openStartup(id);
        }
      );

    });

  document
    .querySelectorAll("[data-watch]")
    .forEach(el => {

      el.addEventListener(
        "click",
        e => {

          e.stopPropagation();

          toggleWatch(
            el.dataset.watch
          );
        }
      );

    });

  document
    .querySelectorAll(
      "[data-industry]"
    )
    .forEach(el => {

      el.addEventListener(
        "click",
        async () => {

          state.industry =
            el.dataset.industry;

          state.stage = "All";

          await safeReload();
        }
      );

    });

  document
    .querySelectorAll(
      "[data-stage]"
    )
    .forEach(el => {

      el.addEventListener(
        "click",
        async () => {

          state.stage =
            el.dataset.stage;

          await safeReload();
        }
      );

    });

  const search =
    document.getElementById(
      "search"
    );

  if (search) {

    let timer;

    search.addEventListener(
      "input",
      () => {

        clearTimeout(timer);

        state.search =
          search.value;

        timer = setTimeout(
          () =>
            safeReload(),
          250
        );

      }
    );
  }

  const sort =
    document.getElementById(
      "sort"
    );

  if (sort) {

    sort.addEventListener(
      "change",
      async () => {

        state.sort =
          sort.value;

        await safeReload();
      }
    );
  }

  document
    .querySelector(
      "[data-filter-score]"
    )
    ?.addEventListener(
      "click",
      async () => {

        state.minScore =
          state.minScore
            ? 0
            : 85;

        await safeReload();
      }
    );

  document
    .querySelector(
      "[data-filter-funding]"
    )
    ?.addEventListener(
      "click",
      async () => {

        state.minFunding =
          state.minFunding
            ? 0
            : 5_000_000;

        await safeReload();
      }
    );

  document
    .querySelector(
      "[data-filter-growth]"
    )
    ?.addEventListener(
      "click",
      async () => {

        state.minGrowth =
          state.minGrowth
            ? 0
            : 100;

        await safeReload();
      }
    );

  document
    .querySelector(
      "[data-action=load-more]"
    )
    ?.addEventListener(
      "click",
      async () => {

        state.page += 1;

        try {

          await loadStartups(
            false
          );

          render();

        } catch (e) {

          state.page -= 1;

          toast(
            e.message,
            true
          );
        }

      }
    );

  document
    .querySelector(
      "[data-action=upload]"
    )
    ?.addEventListener(
      "click",
      () => {

        state.uploadOpen =
          true;

        render();
      }
    );

  document
    .querySelector(
      "[data-action=close-upload]"
    )
    ?.addEventListener(
      "click",
      () => {

        state.uploadOpen =
          false;

        render();
      }
    );

  document
    .querySelector(
      "[data-action=reset]"
    )
    ?.addEventListener(
      "click",
      resetApp
    );

  document
    .querySelector(
      "[data-action=home]"
    )
    ?.addEventListener(
      "click",
      () => {

        state.tab = "Find";

        state.selected =
          null;

        render();
      }
    );

  document
    .querySelector(
      "[data-action=back]"
    )
    ?.addEventListener(
      "click",
      () => {

        state.selected =
          null;

        render();
      }
    );

  document
    .querySelector(
      "[data-action=api-docs]"
    )
    ?.addEventListener(
      "click",
      () => {

        window.open(
          "/docs",
          "_blank"
        );
      }
    );

  document
    .querySelector(
      "[data-action=clear-compare]"
    )
    ?.addEventListener(
      "click",
      () => {

        state.compareIds =
          [];

        render();
      }
    );

  document
    .querySelectorAll(
      "[data-compare]"
    )
    .forEach(el => {

      el.addEventListener(
        "change",
        () => {

          state.compareIds =
            state.compareIds ||
            [];

          if (el.checked) {

            if (
              state.compareIds
                .length >= 3
            ) {

              el.checked =
                false;

              toast(
                "Compare supports up to 3 startups.",
                true
              );

              return;
            }

            state.compareIds.push(
              el.dataset.compare
            );

          } else {

            state.compareIds =
              state.compareIds.filter(
                x =>
                  x !==
                  el.dataset.compare
              );
          }

          render();
        }
      );

    });

  document
    .querySelector(
      "[data-action=submit-upload]"
    )
    ?.addEventListener(
      "click",
      submitUpload
    );
}

async function safeReload() {

  try {

    await loadStartups(
      true
    );

    state.summary =
      await api(
        "/api/summary"
      );

    state.meta =
      await api(
        "/api/meta"
      );

    render();

  } catch (e) {

    toast(
      e.message,
      true
    );
  }
}

async function openStartup(
  id
) {

  try {

    state.selected =
      await api(
        `/api/startups/${encodeURIComponent(
          id
        )}`
      );

    state.tab =
      "Find";

    render();

  } catch (e) {

    toast(
      e.message,
      true
    );
  }
}

function toggleWatch(id) {

  if (
    state.watchlist.has(id)
  ) {

    state.watchlist.delete(
      id
    );

    state.watchItems =
      state.watchItems.filter(
        x =>
          x.startup_id !== id
      );

  } else {

    state.watchlist.add(id);

    const item =
      state.startups.find(
        x =>
          x.startup_id === id
      );

    if (
      item &&
      !state.watchItems.some(
        x =>
          x.startup_id === id
      )
    ) {

      state.watchItems.push(
        item
      );
    }
  }

  saveWatchlist();

  render();
}

async function resetApp() {

  if (
    !confirm(
      "Reset VentureIQ to a completely clean slate? This clears the active dataset and watchlist."
    )
  ) {
    return;
  }

  try {

    await api(
      "/api/reset",
      {
        method: "POST"
      }
    );

    state.tab =
      "Find";

    state.startups =
      [];

    state.watchItems =
      [];

    state.total =
      0;

    state.page =
      1;

    state.selected =
      null;

    state.analysis =
      null;

    state.meta =
      await api(
        "/api/meta"
      );

    state.summary =
      await api(
        "/api/summary"
      );

    state.industry =
      "All";

    state.stage =
      "All";

    state.minScore =
      0;

    state.minFunding =
      0;

    state.minGrowth =
      0;

    state.search =
      "";

    state.sort =
      "score";

    state.watchlist.clear();

    saveWatchlist();

    toast(
      "VentureIQ reset. Clean slate ready."
    );

    render();

  } catch (e) {

    toast(
      e.message,
      true
    );
  }
}

async function submitUpload() {

  const dataset =
    document.getElementById(
      "dataset-file"
    )?.files?.[0];

  const deck =
    document.getElementById(
      "deck-file"
    )?.files?.[0];

  const error =
    document.getElementById(
      "upload-error"
    );

  if (!dataset) {

    error.innerHTML = `
      <div class="flag section">
        Choose a CSV, XLSX or XLS dataset first.
      </div>
    `;

    return;
  }

  const button =
    document.querySelector(
      "[data-action=submit-upload]"
    );

  button.disabled =
    true;

  button.textContent =
    "Analyzing…";

  try {

    const form =
      new FormData();

    form.append(
      "dataset",
      dataset
    );

    if (deck) {

      form.append(
        "deck",
        deck
      );
    }

    const result =
      await api(
        "/api/analyze",
        {
          method: "POST",
          body: form
        }
      );

    state.analysis =
      result;

    state.startups =
      (
        result.startups ||
        []
      ).map(toSummary);

    state.total =
      state.startups.length;

    state.page =
      1;

    state.pageSize =
      Math.max(
        state.startups.length,
        25
      );

    state.meta =
      await api(
        "/api/meta"
      );

    state.summary =
      await api(
        "/api/summary"
      );

    state.uploadOpen =
      false;

    state.selected =
      null;

    state.tab =
      "Find";

    toast(
      `Analysis complete — ${
        state.startups.length
      } startup${
        state.startups.length ===
        1
          ? ""
          : "s"
      } loaded.`
    );

    render();

  } catch (e) {

    error.innerHTML = `
      <div class="flag section">
        ${esc(e.message)}
      </div>
    `;

    button.disabled =
      false;

    button.textContent =
      "Run VentureIQ Analysis";
  }
}

function toSummary(r) {

  return {

    startup_id:
      String(
        r.Startup_ID || ""
      ),

    name:
      r.Startup_Name ||
      "Unnamed startup",

    industry:
      r.Industry ||
      "Unclassified",

    stage:
      r.Funding_Stage,

    location:
      r.Location,

    attractiveness_score:
      r.score
        ?.attractiveness_score ??
      0,

    risk_score:
      r.score?.risk_score ??
      0,

    risk_level:
      r.score?.risk_level ||
      "Unknown",

    investment_category:
      r.score
        ?.investment_category ||
      "Further Diligence",

    revenue:
      r.Revenue,

    funding_raised:
      r.Funding_Raised,

    revenue_growth:
      r.Revenue_Growth,

    customers:
      r.Customers,

    business_model:
      r.Business_Model
  };
}

state.compareIds = [];

state.uploadOpen = false;

boot();