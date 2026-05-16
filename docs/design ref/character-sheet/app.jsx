/* global React, ReactDOM */
const { useState, useEffect, useMemo } = React;

const C = window.CS_CHARACTER;
const CONDS = window.CS_CONDITIONS_ALL;
const SKILL_LIST = window.CS_SKILL_LIST;
const CS_LOG = window.CS_LOG;

// ---------- Top Bar ----------
function TopBar({ tab, setTab }) {
  return (
    <header className="topbar">
      <div className="tb-brand">
        <div className="tb-mark" />
        <span className="name">Ironyard</span>
      </div>
      <div className="tb-divider" />
      <nav className="cs-nav">
        <a href="#">Home</a>
        <a href="#">Campaigns</a>
        <a href="#" className="on">
          Characters
        </a>
        <a href="#">Foes</a>
      </nav>
      <div className="tb-spacer" />
      <div className="tb-stat">
        <span>Level</span>
        <b>{C.level}</b>
      </div>
      <div className="tb-stat">
        <span>Victories</span>
        <b>{C.victories}</b>
      </div>
      <div className="tb-stat">
        <span>XP</span>
        <b>
          {C.xp}
          <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>/{C.xpToNext}</span>
        </b>
      </div>
      <button className="tb-btn">Tweaks</button>
      <button className="tb-btn">Edit in wizard</button>
      <button className="tb-btn primary">▶ Join lobby</button>
    </header>
  );
}

// ---------- Identity Card ----------
function IdentityCard() {
  return (
    <div className={`id-card pack-${C.pack}`}>
      <div className="id-sigil">{C.sigil}</div>
      <div className="id-info">
        <h1 className="id-name">
          {C.name}
          <span className="id-pron">{C.pronouns}</span>
        </h1>
        <div className="id-line">
          <span>
            Level <b>{C.level}</b>
          </span>
          <span className="sep">·</span>
          <span>
            <b>{C.class}</b>
          </span>
          <span className="sep">·</span>
          <span>
            <b>{C.subclass}</b>
          </span>
          <span className="sep">·</span>
          <span>
            <b>{C.ancestry}</b>
          </span>
          <span className="sep">·</span>
          <span>
            <b>{C.career}</b>
          </span>
        </div>
      </div>
      <div className="id-cta">
        <div className="id-status">
          Controlled by <b>{C.controller}</b>
        </div>
        <div className="id-status">
          Pack · <b>{C.pack}</b>
        </div>
      </div>
    </div>
  );
}

// ---------- Vitals ----------
function VitalsCard() {
  const stamPct = (C.stamina.current / C.stamina.max) * 100;
  const windedPct = (C.stamina.winded / C.stamina.max) * 100;
  return (
    <div className="sec">
      <div className="sec-head">
        <h3>Vitals</h3>
        <div className="right">at rest</div>
      </div>
      <div className="sec-body">
        <div className="vital-grid">
          <div className="vital-row" style={{ gridColumn: '1 / -1' }}>
            <div className="k">Stamina</div>
            <div className="v">
              <span className="tab">{C.stamina.current}</span>
              <span className="sep">/</span>
              <span className="tab">{C.stamina.max}</span>
              <span className="hint">
                winded ≤ {C.stamina.winded} · dying −{Math.floor(C.stamina.max / 2)} to 0
              </span>
            </div>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="stam-track">
              <i style={{ width: `${stamPct}%` }} />
              <span className="stam-track-winded-tick stam-track" />
              <span className="winded-tick" style={{ left: `${windedPct}%` }} />
            </div>
            <div className="stam-legend">
              <span>
                <b>{C.stamina.current}</b> current
              </span>
              <span>
                <b>{C.stamina.temporary}</b> temp
              </span>
              <span>
                <b>{C.stamina.winded}</b> winded threshold
              </span>
            </div>
          </div>
          <div className="vital-row">
            <div className="k">Recoveries</div>
            <div className="v">
              <span className="tab">{C.recoveries.current}</span>
              <span className="sep">/</span>
              <span className="tab">{C.recoveries.max}</span>
              <span className="hint">value {C.recoveries.value}</span>
            </div>
          </div>
          <div className="vital-row">
            <div className="k">{C.resource.name}</div>
            <div className="v">
              <span className="tab">{C.resource.current}</span>
              <span className="sep">/</span>
              <span className="tab">{C.resource.max}</span>
              <span className="res-pips">
                {Array.from({ length: C.resource.max }).map((_, i) => (
                  <i key={i} className={i < C.resource.current ? 'on' : ''} />
                ))}
              </span>
            </div>
          </div>
          <div className="vital-row">
            <div className="k">Size</div>
            <div className="v">
              <span className="tab">{C.stats.size}</span>
            </div>
          </div>
          <div className="vital-row">
            <div className="k">Speed</div>
            <div className="v">
              <span className="tab">{C.stats.speed}</span>
            </div>
          </div>
          <div className="vital-row">
            <div className="k">Stability</div>
            <div className="v">
              <span className="tab">{C.stats.stability}</span>
            </div>
          </div>
          <div className="vital-row">
            <div className="k">Disengage</div>
            <div className="v">
              <span className="tab">{C.stats.disengage}</span>
            </div>
          </div>
          <div className="vital-row">
            <div className="k">Free Strike</div>
            <div className="v">
              <span className="tab">2</span>
              <span className="hint">melee · Whisperblade</span>
            </div>
          </div>
          <div className="vital-row">
            <div className="k">Melee dist</div>
            <div className="v">
              <span className="tab">{C.stats.meleeDist}</span>
              <span className="hint">bonus {C.stats.meleeBonus}</span>
            </div>
          </div>
          <div className="vital-row">
            <div className="k">Ranged dist</div>
            <div className="v">
              <span className="tab">{C.stats.rangedDist}</span>
              <span className="hint">bonus {C.stats.rangedBonus}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Resource Strip (tokens, surges, potency) ----------
function ResourceStrip() {
  const tokens = Array.from({ length: 3 });
  return (
    <div className="res-strip">
      <div className="res-cell">
        <div className="k">Hero Tokens</div>
        <div className="token-row">
          {tokens.map((_, i) => (
            <i key={i} className={i < C.heroTokens ? 'on' : ''} />
          ))}
        </div>
        <div className="k" style={{ letterSpacing: '0.06em' }}>
          {C.heroTokens} of 3 available
        </div>
      </div>
      <div className="res-cell">
        <div className="k">Surges</div>
        <div className="v tabular">{C.surges}</div>
        <div className="k" style={{ letterSpacing: '0.06em' }}>
          1 surge = damage +R
        </div>
      </div>
      <div className="res-cell">
        <div className="k">Potency</div>
        <div className="v tabular" style={{ fontSize: 14 }}>
          <span style={{ color: 'var(--text-mute)' }}>W</span>
          <span>{C.potency.weak}</span>
          <span style={{ color: 'var(--text-mute)', marginLeft: 6 }}>A</span>
          <span>{C.potency.average}</span>
          <span style={{ color: 'var(--text-mute)', marginLeft: 6 }}>S</span>
          <span>{C.potency.strong}</span>
        </div>
        <div className="k" style={{ letterSpacing: '0.06em' }}>
          vs target's char.
        </div>
      </div>
      <div className="res-cell">
        <div className="k">Wealth · Renown</div>
        <div className="v tabular">
          {C.wealth}
          <span className="of"> · {C.renown}</span>
        </div>
        <div className="k" style={{ letterSpacing: '0.06em' }}>
          coin · reputation
        </div>
      </div>
    </div>
  );
}

// ---------- Characteristics ----------
function CharsCard() {
  return (
    <div className="sec">
      <div className="sec-head">
        <h3>Characteristics</h3>
        <div className="right">2 locked by class</div>
      </div>
      <div className="sec-body">
        <div className="cs-chargrid">
          {C.chars.map((c) => (
            <div key={c.k} className={`cs-char ${c.locked ? 'locked' : ''}`}>
              <div className="k">{c.k}</div>
              <div className="v">{c.v >= 0 ? `+${c.v}` : c.v}</div>
              {c.locked && <div className="src">via {c.source}</div>}
              {!c.locked && (
                <div className="src" style={{ opacity: 0 }}>
                  ·
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Kit ----------
function KitCard() {
  return (
    <div className="sec">
      <div className="sec-head">
        <h3>
          Equipment · kit — <b>{C.kit.name}</b>
        </h3>
        <div className="right">applied</div>
      </div>
      <div className="sec-body">
        <div className="kit">
          <div className="kit-row">
            <div className="k">Weapon</div>
            <div className="v">{C.kit.weapon}</div>
          </div>
          <div className="kit-row">
            <div className="k">Armor</div>
            <div className="v">{C.kit.armor}</div>
          </div>
          <div className="kit-row">
            <div className="k">Speed bonus</div>
            <div className="v">+0</div>
          </div>
          <div className="kit-row">
            <div className="k">Stamina bonus</div>
            <div className="v">+3</div>
          </div>
          <div className="kit-row">
            <div className="k">Stability bonus</div>
            <div className="v">+1</div>
          </div>
          <div className="kit-row">
            <div className="k">Ranged dist</div>
            <div className="v">+1</div>
          </div>
          <div className="kit-note">{C.kit.notes}</div>
        </div>
      </div>
    </div>
  );
}

// ---------- Skills ----------
function SkillsCard() {
  const owned = new Set(Object.values(C.skills).flat());
  return (
    <div className="sec">
      <div className="sec-head">
        <h3>Skills</h3>
        <div className="right">
          {owned.size} of {Object.values(SKILL_LIST).flat().length}
        </div>
      </div>
      <div className="sec-body">
        {Object.entries(SKILL_LIST).map(([group, list]) => (
          <div key={group} className="skill-group">
            <h4>{group}</h4>
            <div className="skill-list">
              {list.map((s) => (
                <span key={s} className={`skill ${owned.has(s) ? 'on' : ''}`}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Trinkets / Treasures / Consumables ----------
function GearCard() {
  return (
    <div className="sec">
      <div className="sec-head">
        <h3>Trinkets · Titles · Consumables</h3>
        <div className="right">3 carried</div>
      </div>
      <div className="sec-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div className="skill-group" style={{ marginBottom: 6 }}>
            <h4>Treasures</h4>
          </div>
          {C.treasures.map((t) => (
            <div key={t.name} className="treasure">
              <div className="nm">
                {t.name}
                <span className="slot">{t.slot}</span>
              </div>
              <div className="body">{t.body}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="skill-group" style={{ marginBottom: 6 }}>
            <h4>Titles</h4>
          </div>
          <div className="tiny-list">
            {C.titles.map((t) => (
              <div key={t} className="row">
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="skill-group" style={{ marginBottom: 6 }}>
            <h4>Trinkets</h4>
          </div>
          <div className="tiny-list">
            {C.trinkets.map((t) => (
              <div key={t} className="row">
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="skill-group" style={{ marginBottom: 6 }}>
            <h4>Consumables</h4>
          </div>
          <div className="tiny-list">
            {C.consumables.map((t) => (
              <div key={t} className="row">
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Ability Card (mirrors combat tracker .ability) ----------
function AbilityCard({ ab }) {
  const catClass =
    ab.category === 'signature' ? 'signature' : ab.category === 'heroic' ? 'heroic' : 'free';
  return (
    <div className={`ability ${ab.category === 'heroic' ? 'malice' : 'signature'}`}>
      <div className="ab-head">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span className="ab-name">{ab.name}</span>
          {ab.cost && (
            <span className="ab-cost">
              ◆ {ab.cost} {C.resource.name}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className={`ab-cat ${catClass}`}>{ab.category}</span>
          <span className={`ab-action ${ab.action.toLowerCase()}`}>{ab.action}</span>
        </div>
      </div>
      {(ab.keywords || ab.distance || ab.target) && (
        <div className="ab-meta">
          {ab.keywords &&
            ab.keywords.map((k) => (
              <span key={k}>
                <b>{k}</b>
              </span>
            ))}
          {ab.distance && <span>↦ {ab.distance}</span>}
          {ab.target && <span>● {ab.target}</span>}
        </div>
      )}
      {ab.trigger && (
        <div className="ab-trigger">
          <b>Trigger.</b> {ab.trigger}
        </div>
      )}
      {ab.roll && (
        <div className="ab-roll">
          <div className="ab-rollline">
            <span className="mono">2d10 +</span>
            <b>{ab.roll.mod}</b>
            <span className="mono">
              {' '}
              · {ab.roll.stat} vs {ab.roll.vs}
            </span>
          </div>
        </div>
      )}
      {ab.tiers && (
        <div className="tiers">
          {ab.tiers.map((t, i) => (
            <div key={i} className={`tier ${i === 2 ? 'crit' : ''}`}>
              <div className="r">{t.range}</div>
              <div className="o">{t.out}</div>
            </div>
          ))}
        </div>
      )}
      {ab.effect && !ab.tiers && (
        <div className="ab-body" style={{ marginTop: 6 }}>
          {ab.effect}
        </div>
      )}
    </div>
  );
}

// ---------- Story / Lineage / Activity panels ----------
function StoryPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="prose-block">
        <div className="head">
          <h3>Career — {C.career}</h3>
          <span className="lbl">earned</span>
        </div>
        <p className="prose">
          Years of quiet study at the Quiet College — copying out crumbling treatises, sitting with
          old psions on their last evenings, learning to listen to silence rather than fill it. The
          work taught Ash patience. The work taught Ash that most minds are louder than they think.
        </p>
        <div className="sub">Inciting incident</div>
        <p className="prose">{C.inciting}</p>
      </div>

      <div className="prose-block">
        <div className="head">
          <h3>Complication</h3>
          <span className="tag">Bound Promise</span>
        </div>
        <div className="item">
          <div className="name">Benefit</div>
          <div className="body">
            When you tell the truth in a tense moment, you have edge on your next Presence test in
            the scene.
          </div>
        </div>
        <div className="item">
          <div className="name">Drawback</div>
          <div className="body">
            When asked a direct question, you must answer truthfully. You may refuse to answer, but
            you cannot lie.
          </div>
        </div>
      </div>

      <div className="prose-block">
        <div className="head">
          <h3>Culture</h3>
          <span className="lbl">background</span>
        </div>
        <div className="item">
          <div className="name">Environment</div>
          <div className="body">{C.culture.environment}</div>
        </div>
        <div className="item">
          <div className="name">Organization</div>
          <div className="body">{C.culture.organization}</div>
        </div>
        <div className="item">
          <div className="name">Upbringing</div>
          <div className="body">{C.culture.upbringing}</div>
        </div>
        <div className="item">
          <div className="name">Languages</div>
          <div className="body">{C.culture.languages.join(' · ')}</div>
        </div>
      </div>
    </div>
  );
}

function LineagePanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {C.features.map((g) => (
        <div className="prose-block" key={g.group}>
          <div className="head">
            <h3>{g.group}</h3>
            <span className="lbl">
              {g.items.length} {g.items.length === 1 ? 'trait' : 'traits'}
            </span>
          </div>
          {g.items.map((it) => (
            <div className="item" key={it.name}>
              <div className="name">{it.name}</div>
              <div className="body">{it.body}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ActivityPanel() {
  return (
    <div style={{ padding: 14 }}>
      <div className="log-body" style={{ padding: 0 }}>
        {CS_LOG.map((e, i) => (
          <div key={i} className="log-row">
            <div className="who">{e.who}</div>
            <div className="txt">{e.txt}</div>
            <div className="t">{e.t}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Attach to Campaign ----------
function AttachCampaign() {
  const [joined, setJoined] = useState(true);
  const [code, setCode] = useState('EMBER-7');
  if (joined) {
    return (
      <div className="attach">
        <div className="head">
          <h4>Campaign</h4>
          <span className="lbl">attached</span>
        </div>
        <div className="joined">
          <span className="dot" />
          <span>
            Currently in <b style={{ color: 'var(--text)' }}>The Ember Reaches</b> · Session 7 ·
            controlled by Mike
          </span>
        </div>
        <p>
          Leave the campaign to free this character for another table, or jump straight into the
          lobby for tonight's session.
        </p>
        <div className="row">
          <button className="tb-btn primary" style={{ flex: 1, justifyContent: 'center' }}>
            ▶ Open lobby
          </button>
          <button className="tb-btn" onClick={() => setJoined(false)}>
            Detach
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="attach">
      <div className="head">
        <h4>Attach to a campaign</h4>
        <span className="lbl">not attached</span>
      </div>
      <p>Paste an invite code to join the campaign and submit this character to the director.</p>
      <div className="row">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABCDEF"
        />
        <button className="tb-btn primary" onClick={() => setJoined(true)}>
          Attach
        </button>
      </div>
    </div>
  );
}

// ---------- Overview panel — the former sidebar content ----------
function OverviewPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ResourceStrip />
      <VitalsCard />
      <CharsCard />
      <KitCard />
      <SkillsCard />
      <GearCard />
      <AttachCampaign />
    </div>
  );
}

// ---------- Sheet (single column, full width) ----------
function Sheet() {
  const [tab, setTab] = useState('overview');
  const grouped = useMemo(
    () => ({
      signature: C.abilities.filter((a) => a.category === 'signature'),
      heroic: C.abilities.filter((a) => a.category === 'heroic'),
      free: C.abilities.filter((a) => a.category === 'free'),
    }),
    [],
  );

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'abilities', label: 'Abilities' },
    { id: 'lineage', label: 'Features' },
    { id: 'story', label: 'Story' },
    { id: 'activity', label: 'Activity' },
  ];

  return (
    <div className="sheet">
      <div className="sheet-head">
        <div className="sheet-head-top" style={{ marginBottom: 0 }}>
          <div className="role" style={{ color: 'var(--pk, var(--accent))' }}>
            {C.class} · {C.subclass} · L{C.level}
          </div>
          <div className="cs-tabs">
            {tabs.map((t) => (
              <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="sheet-body">
        {tab === 'overview' && <OverviewPanel />}
        {tab === 'abilities' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="sub-label">
              <span className="lbl-mini">Signature · always available</span>
              <span className="lbl-mini" style={{ color: 'var(--text-mute)' }}>
                {grouped.signature.length} cards
              </span>
            </div>
            {grouped.signature.map((ab) => (
              <AbilityCard key={ab.id} ab={ab} />
            ))}
            <div className="sub-label" style={{ marginTop: 8 }}>
              <span className="lbl-mini">Heroic · costs {C.resource.name}</span>
              <span className="lbl-mini" style={{ color: 'var(--text-mute)' }}>
                {C.resource.current}/{C.resource.max} {C.resource.name.toLowerCase()} on hand
              </span>
            </div>
            {grouped.heroic.map((ab) => (
              <AbilityCard key={ab.id} ab={ab} />
            ))}
            <div className="sub-label" style={{ marginTop: 8 }}>
              <span className="lbl-mini">Free Strike · when an opening appears</span>
            </div>
            {grouped.free.map((ab) => (
              <AbilityCard key={ab.id} ab={ab} />
            ))}
          </div>
        )}
        {tab === 'lineage' && <LineagePanel />}
        {tab === 'story' && <StoryPanel />}
        {tab === 'activity' && <ActivityPanel />}
      </div>
    </div>
  );
}

// ---------- App ----------
function App() {
  useEffect(() => {
    document.body.dataset.theme = 'dark';
    document.body.dataset.pack = C.pack;
    document.body.dataset.density = 'balanced';
  }, []);

  return (
    <>
      <TopBar />
      <main className="cs-stage">
        <div className={`cs-page pack-${C.pack}`}>
          <IdentityCard />
          <Sheet />
        </div>
      </main>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
