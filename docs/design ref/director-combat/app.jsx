/* global React, ReactDOM */
const { useState, useEffect, useRef, useCallback } = React;

const PARTY = window.DC_PARTY;
const MONSTERS_INIT = window.DC_MONSTERS;
const STATBLOCKS = window.DC_STATBLOCKS;
const CAMPAIGN = window.DC_CAMPAIGN;
const LOG_INIT = window.DC_LOG;
const CONDITIONS = window.DC_CONDITIONS;

// Auto-sort: alive+ready → alive+acted → dead
function sortMon(a, b) {
  if (a.dead !== b.dead) return a.dead ? 1 : -1;
  if (a.acted !== b.acted) return a.acted ? 1 : -1;
  return 0;
}

// ---------- helpers ----------
function hpClass(cur, max) {
  const p = cur / max;
  if (p <= 0.33) return 'bad';
  if (p <= 0.66) return 'warn';
  return '';
}
function hpPct(cur, max) {
  return Math.max(0, Math.min(100, (cur / max) * 100));
}

// ---------- Top Bar ----------
function TopBar({ tweaks, onOpenTweaks }) {
  return (
    <header className="topbar">
      <div className="tb-brand">
        <div className="tb-mark" />
        <span className="name">Ironyard</span>
      </div>
      <div className="tb-divider" />
      <div className="tb-crumb">
        <span>{CAMPAIGN.name}</span>
        <span className="sep">/</span>
        <span>Session {CAMPAIGN.session}</span>
        <span className="sep">/</span>
        <b>{CAMPAIGN.encounter}</b>
      </div>
      <div className="tb-spacer" />
      <div className="tb-stat">
        <span>Round</span>
        <b>{CAMPAIGN.round}</b>
      </div>
      <div className="tb-stat">
        <span>Victories</span>
        <b>{CAMPAIGN.victories}</b>
      </div>
      <div className="tb-malice" title="Malice">
        <span className="dot" />
        <span className="tb-stat">
          <span>Malice</span>
          <b>{CAMPAIGN.malice}</b>
        </span>
      </div>
      <button className="tb-btn" onClick={onOpenTweaks}>
        Tweaks
      </button>
      <button className="tb-btn primary">End Round</button>
    </header>
  );
}

// ---------- Turn Bar ----------
function TurnBar({ side, heroesActed, heroesTotal, directorActed, directorTotal, onSwap }) {
  const isDir = side === 'director';
  const acted = isDir ? directorActed : heroesActed;
  const total = isDir ? directorTotal : heroesTotal;
  return (
    <div className={`turnbar ${isDir ? '' : 'heroes'}`}>
      <div className="tb-active">
        <span className="glyph" />
        <span>{isDir ? "Director's turn" : "Heroes' turn"}</span>
      </div>
      <div className="tb-side">
        Round {CAMPAIGN.round} · {acted} of {total} acted
      </div>
      <div className="turn-progress">
        <div className="tp-bar">
          <i style={{ width: `${(acted / total) * 100}%` }} />
        </div>
      </div>
      <div className="turn-actions">
        <button className="tb-btn" onClick={onSwap}>
          Pass
        </button>
        <button className="tb-btn primary">End Turn →</button>
      </div>
    </div>
  );
}

// ---------- Hero Row ----------
function HeroRow({ hero, active, turn, onClick }) {
  const cls = hpClass(hero.stamina, hero.maxStamina);
  const pct = hpPct(hero.stamina, hero.maxStamina);
  const pips = [];
  for (let i = 0; i < hero.resourceMax; i++) pips.push(i < hero.resourceVal);
  return (
    <div
      className={`hrow pack-${hero.pack} ${active ? 'active' : ''} ${turn ? 'turn' : ''} ${hero.acted ? 'acted' : ''}`}
      onClick={onClick}
    >
      <div className="hrow-sigil">{hero.sigil}</div>
      <div className="hrow-info">
        <div className="nm">
          {hero.name}
          <span className="ctrl">{hero.controller}</span>
        </div>
        <div className="role">
          L{hero.level} · {hero.class} · {hero.subclass}
        </div>
      </div>
      <div className="hrow-conds">
        {hero.conditions.map((c) => (
          <span key={c.name} className="mon-cond" title={c.name}>
            {c.glyph}
          </span>
        ))}
      </div>
      <div className="hrow-resource">
        <div className="lbl">{hero.resource.slice(0, 3).toUpperCase()}</div>
        <div className="pips">
          {pips.map((on, i) => (
            <i key={i} className={on ? 'on' : ''} />
          ))}
        </div>
      </div>
      <div className="hrow-rec">
        <div className="lbl">REC</div>
        <div className="val tabular">
          {hero.recoveries}
          <span className="of">/{hero.maxRecoveries}</span>
        </div>
      </div>
      <div className="hrow-stam">
        <div className="num tabular">
          {hero.stamina}
          <span className="max">/{hero.maxStamina}</span>
        </div>
        <div className={`mini ${cls}`}>
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

// ---------- Monster Row ----------
function MonRow({ mon, active, turn, onClick, onDamage, shaking }) {
  const cls = hpClass(mon.stamina, mon.maxStamina);
  const pct = hpPct(mon.stamina, mon.maxStamina);
  return (
    <div
      className={`mon ${mon.org === 'leader' ? 'solo' : ''} ${active ? 'active' : ''} ${turn ? 'turn' : ''} ${mon.acted ? 'acted' : ''} ${mon.dead ? 'dead' : ''} ${shaking ? 'fx-shake' : ''}`}
      onClick={onClick}
    >
      <div className="glyph">{mon.tag || '★'}</div>
      <div className="mon-info">
        <div className="nm">
          {mon.name}
          {mon.tag && <span className="tag">{mon.tag}</span>}
        </div>
        <div className="role">
          L{mon.level} · {mon.role}
        </div>
      </div>
      <div className="mon-right">
        <div className="mon-conds">
          {mon.conditions.map((c) => (
            <span key={c.name} className="mon-cond" title={c.name}>
              {c.glyph}
            </span>
          ))}
        </div>
        <div className="mon-stam">
          <div className="num tabular">
            {mon.stamina}
            <span className="max">/{mon.maxStamina}</span>
          </div>
          <div className={`mini ${cls}`}>
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>
        <button
          className="dmg-btn"
          title="Apply damage"
          onClick={(e) => {
            e.stopPropagation();
            onDamage(mon.id);
          }}
        >
          −5
        </button>
      </div>
    </div>
  );
}

// ---------- Ability Card ----------
function AbilityCard({ ab, onRoll, lastRoll }) {
  const kindClass = ab.kind === 'malice' ? 'malice' : 'signature';
  return (
    <div className={`ability ${kindClass}`}>
      <div className="ab-head">
        <span className="ab-name">{ab.name}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {ab.kind === 'malice' && <span className="ab-cost">◆ {ab.cost} malice</span>}
          <span className={`ab-action ${ab.action.toLowerCase()}`}>{ab.action}</span>
        </div>
      </div>
      {ab.keywords && (
        <div className="ab-meta">
          {ab.keywords.map((k) => (
            <span key={k}>
              <b>{k}</b>
            </span>
          ))}
          {ab.distance && <span>{ab.distance}</span>}
          {ab.target && <span>{ab.target}</span>}
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
            {lastRoll && (
              <span className="mono" style={{ marginLeft: 10, color: 'var(--accent-strong)' }}>
                ↪ {lastRoll}
              </span>
            )}
          </div>
          <button className="ab-rollbtn" onClick={() => onRoll(ab)}>
            Roll <span className="d">2d10</span>
          </button>
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
      {ab.effect && !ab.tiers && <div className="ab-body">{ab.effect}</div>}
    </div>
  );
}

// ---------- Turn Flow ----------
function FlowStep({ n, label, hint, done, onToggle, accent, children }) {
  return (
    <section className={`flow-step ${done ? 'done' : ''}`} data-accent={accent || 'foe'}>
      <header className="fs-head">
        <div className="fs-num" onClick={onToggle}>
          {done ? <span className="fs-tick">✓</span> : <span>{n}</span>}
        </div>
        <div className="fs-meta">
          <div className="fs-name">{label}</div>
          <div className="fs-hint">{hint}</div>
        </div>
        <button className="fs-skip" onClick={onToggle}>
          {done ? 'Undo' : 'Skip'}
        </button>
      </header>
      <div className="fs-body">{children}</div>
    </section>
  );
}

function FlowAbility({ ab, onRoll, lastRoll, done }) {
  return (
    <div className={`flow-ab ${done ? 'used' : ''}`}>
      <div className="fa-top">
        <div className="fa-name">
          {ab.name}
          {ab.kind === 'malice' && <span className="fa-malice">◆ {ab.cost}</span>}
        </div>
        {ab.distance && <div className="fa-dist">{ab.distance}</div>}
      </div>
      {ab.roll && (
        <div className="fa-row">
          <div className="fa-line">
            <span className="mono">2d10</span>
            <b>{ab.roll.mod}</b>
            <span className="mono">· vs {ab.roll.vs}</span>
            {lastRoll && <span className="fa-result">{lastRoll}</span>}
          </div>
          <button className="fa-roll" onClick={() => onRoll(ab)}>
            Roll <span className="d">2d10</span>
          </button>
        </div>
      )}
      {!ab.roll && ab.effect && (
        <>
          <div className="fa-effect">{ab.effect}</div>
          <div className="fa-row">
            <span />
            <button className="fa-roll secondary" onClick={() => onRoll(ab)}>
              Use
            </button>
          </div>
        </>
      )}
      {ab.tiers && (
        <div className="fa-tiers">
          {ab.tiers.map((t, i) => (
            <div key={i} className={`fa-tier ${i === 2 ? 'crit' : ''}`}>
              <span className="r">{t.range}</span>
              <span className="o">{t.out}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TurnFlow({ block, completed, onMark, onReset, onRoll, lastRoll }) {
  const mains = block.abilities.filter((a) => a.action === 'Main');
  const manvs = block.abilities.filter((a) => a.action === 'Maneuver');
  const trigs = block.abilities.filter((a) => a.action === 'Triggered');
  const rollAndMark = (step) => (ab) => {
    onRoll(ab);
    onMark(step, true);
  };
  const allDone = completed.main && completed.maneuver && completed.move;
  return (
    <div className="flow">
      <FlowStep
        n={1}
        label="Main Action"
        hint="Strike, area effect, signature move — 1 per turn"
        done={completed.main}
        onToggle={() => onMark('main', !completed.main)}
      >
        {mains.map((ab) => (
          <FlowAbility
            key={ab.id}
            ab={ab}
            onRoll={rollAndMark('main')}
            lastRoll={lastRoll[ab.id]}
            done={completed.main}
          />
        ))}
      </FlowStep>

      <FlowStep
        n={2}
        label="Maneuver"
        hint="Tactical move — 1 per turn"
        done={completed.maneuver}
        onToggle={() => onMark('maneuver', !completed.maneuver)}
      >
        {manvs.length > 0 ? (
          manvs.map((ab) => (
            <FlowAbility
              key={ab.id}
              ab={ab}
              onRoll={rollAndMark('maneuver')}
              lastRoll={lastRoll[ab.id]}
              done={completed.maneuver}
            />
          ))
        ) : (
          <div className="flow-empty">
            No special maneuvers — use a free maneuver (stand up, draw item, grab).
          </div>
        )}
      </FlowStep>

      <FlowStep
        n={3}
        label="Move"
        hint={`Up to ${block.stats.speed} squares`}
        done={completed.move}
        onToggle={() => onMark('move', !completed.move)}
      >
        <div className="move-grid">
          <button className="move-opt" onClick={() => onMark('move', true)}>
            <span className="k">Walk</span>
            <span className="v">{block.stats.speed} sq</span>
          </button>
          <button className="move-opt" onClick={() => onMark('move', true)}>
            <span className="k">Shift</span>
            <span className="v">1 sq · no OA</span>
          </button>
          <button className="move-opt" onClick={() => onMark('move', true)}>
            <span className="k">Hide</span>
            <span className="v">with cover</span>
          </button>
          <button className="move-opt" onClick={() => onMark('move', true)}>
            <span className="k">Stay put</span>
            <span className="v">hold ground</span>
          </button>
        </div>
      </FlowStep>

      {trigs.length > 0 && (
        <div className="flow-extras">
          <div className="flow-extras-head">
            <span>Triggered · free actions</span>
            <span className="sub">react to enemies, not on the clock</span>
          </div>
          {trigs.map((ab) => (
            <div key={ab.id} className="flow-ab compact">
              <div className="fa-top">
                <div className="fa-name">
                  {ab.name}
                  {ab.kind === 'malice' && <span className="fa-malice">◆ {ab.cost}</span>}
                </div>
              </div>
              <div className="fa-trigger">
                <b>Trigger.</b> {ab.trigger}
              </div>
              <div className="fa-effect">{ab.effect}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flow-footer">
        <button className="flow-reset" onClick={onReset}>
          Reset turn
        </button>
        <button className={`flow-end ${allDone ? 'ready' : ''}`}>
          {allDone
            ? 'End turn ✓'
            : `End turn · ${[completed.main, completed.maneuver, completed.move].filter(Boolean).length}/3 done`}
        </button>
      </div>
    </div>
  );
}

// ---------- Condition Picker ----------
function ConditionPicker({ active, onAdd, onRemove }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    setTimeout(() => document.addEventListener('click', close), 0);
    return () => document.removeEventListener('click', close);
  }, [open]);
  const has = (n) => active.conditions.some((c) => c.name === n);
  return (
    <div className="cond-picker" ref={ref}>
      {active.conditions.map((c) => (
        <span key={c.name} className={`chip ${c.name}`}>
          {c.glyph} {c.name}
          <button className="x" onClick={() => onRemove(c.name)} title="Remove">
            ×
          </button>
        </span>
      ))}
      <button className="cond-add" onClick={() => setOpen((v) => !v)}>
        + Condition <span className="caret">▾</span>
      </button>
      {open && (
        <div className="cond-menu">
          {CONDITIONS.map((c) => (
            <button
              key={c.name}
              className={`cond-item ${has(c.name) ? 'on' : ''}`}
              onClick={() => {
                has(c.name) ? onRemove(c.name) : onAdd(c);
                setOpen(false);
              }}
            >
              <span className="g">{c.glyph}</span>
              <span className="n">{c.name}</span>
              {has(c.name) && <span className="k">applied</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Stat Sheet ----------
function StatSheet({
  monster,
  onRoll,
  lastRoll,
  onAddCondition,
  onRemoveCondition,
  view,
  setView,
  turn,
  onMarkStep,
  onResetTurn,
}) {
  const [tab, setTab] = useState('abilities');
  const block = STATBLOCKS[monster.id] || STATBLOCKS.captain;
  const pct = hpPct(monster.stamina, monster.maxStamina);

  return (
    <div className="sheet">
      <div className="sheet-head">
        <div className="sheet-head-top">
          <div className="role">
            {block.role} · EV {block.ev}
          </div>
          <div className="view-toggle">
            <button className={view === 'flow' ? 'on' : ''} onClick={() => setView('flow')}>
              Turn flow
            </button>
            <button className={view === 'sheet' ? 'on' : ''} onClick={() => setView('sheet')}>
              Full sheet
            </button>
          </div>
        </div>
        <h2>{block.name}</h2>
        <div className="meta">
          <span>
            Level <b>{block.level}</b>
          </span>
          <span>{block.org}</span>
          <span>
            Size <b>{block.stats.size}</b>
          </span>
          <span>
            Speed <b>{block.stats.speed}</b>
          </span>
          <span>
            Stability <b>{block.stats.stability}</b>
          </span>
        </div>
        {view === 'sheet' && <p className="flavor">{block.flavor}</p>}
      </div>

      <div className="sheet-stam">
        <div>
          <div className="label">Stamina</div>
          <div className="big tabular">
            {monster.stamina}
            <span className="of"> / {monster.maxStamina}</span>
          </div>
        </div>
        <div className="stam-bar">
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="actions">
          <button className="dmg-btn">−1</button>
          <button className="dmg-btn">−5</button>
          <button className="dmg-btn">−10</button>
          <button className="dmg-btn">Edit</button>
        </div>
      </div>

      {view === 'sheet' && (
        <div className="chargrid">
          {block.chars.map((c) => (
            <div key={c.k} className="ch">
              <div className="k">{c.k}</div>
              <div className="v tabular">{c.v >= 0 ? `+${c.v}` : c.v}</div>
            </div>
          ))}
        </div>
      )}

      <div className="sheet-body">
        {view === 'flow' ? (
          <>
            <div className="tabs-row" style={{ marginBottom: 8 }}>
              <ConditionPicker
                active={monster}
                onAdd={onAddCondition}
                onRemove={onRemoveCondition}
              />
            </div>
            <TurnFlow
              block={block}
              completed={turn}
              onMark={onMarkStep}
              onReset={onResetTurn}
              onRoll={onRoll}
              lastRoll={lastRoll}
            />
          </>
        ) : (
          <>
            <div className="tabs-row">
              <div className="tabs">
                <button
                  className={tab === 'abilities' ? 'on' : ''}
                  onClick={() => setTab('abilities')}
                >
                  Abilities
                </button>
                <button className={tab === 'traits' ? 'on' : ''} onClick={() => setTab('traits')}>
                  Traits
                </button>
                <button className={tab === 'notes' ? 'on' : ''} onClick={() => setTab('notes')}>
                  Notes
                </button>
              </div>
              <ConditionPicker
                active={monster}
                onAdd={onAddCondition}
                onRemove={onRemoveCondition}
              />
            </div>

            {tab === 'abilities' &&
              block.abilities.map((ab) => (
                <AbilityCard key={ab.id} ab={ab} onRoll={onRoll} lastRoll={lastRoll[ab.id]} />
              ))}
            {tab === 'traits' && (
              <div className="ability">
                {block.traits.map((t) => (
                  <div key={t.name} className="trait">
                    <div className="name">{t.name}</div>
                    <div className="body">{t.body}</div>
                  </div>
                ))}
              </div>
            )}
            {tab === 'notes' && (
              <div className="ability">
                <div className="ab-body" style={{ color: 'var(--text-mute)' }}>
                  No private notes for this encounter yet. Use this space for DM-only reminders,
                  motivations, or scripted lines.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Log ----------
function LogRail({ entries, open, setOpen }) {
  return (
    <div className={`log ${open ? 'open' : 'collapsed'}`}>
      <div className="log-head">
        <button className="log-toggle" onClick={() => setOpen(!open)}>
          <span className="chev">▾</span>
          <h3>Intent log</h3>
          <span className="count">{entries.length}</span>
        </button>
        <button className="undo">Undo last ↶</button>
      </div>
      {open && (
        <div className="log-body">
          {entries.map((e, i) => (
            <div key={i} className={`log-row ${e.crit ? 'crit' : ''}`}>
              <div className="who">{e.who}</div>
              <div
                className="txt"
                dangerouslySetInnerHTML={{
                  __html: e.crit ? e.txt.replace(/crit/i, '<b>CRIT</b>') : e.txt,
                }}
              />
              <div className="t">{e.t}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Tweaks ----------
function Tweaks({ open, setOpen, tweaks, setTweaks }) {
  const update = (k, v) => setTweaks((t) => ({ ...t, [k]: v }));
  return (
    <div className={`tweaks ${open ? '' : 'collapsed'}`}>
      <div className="tw-head" onClick={() => setOpen(!open)}>
        <h3>Tweaks</h3>
        <span className="chev">▼</span>
      </div>
      <div className="tw-body">
        <div className="tw-row">
          <div className="lbl">Theme</div>
          <div className="tw-seg">
            <button
              className={tweaks.theme === 'dark' ? 'on' : ''}
              onClick={() => update('theme', 'dark')}
            >
              Dark
            </button>
            <button
              className={tweaks.theme === 'light' ? 'on' : ''}
              onClick={() => update('theme', 'light')}
            >
              Light
            </button>
          </div>
        </div>
        <div className="tw-row">
          <div className="lbl">Pack</div>
          <div className="tw-swatches">
            {['chrome', 'lightning', 'shadow', 'fireball'].map((p) => (
              <div
                key={p}
                className={`tw-sw ${p} ${tweaks.pack === p ? 'on' : ''}`}
                title={p}
                onClick={() => update('pack', p)}
              />
            ))}
          </div>
        </div>
        <div className="tw-row">
          <div className="lbl">Density</div>
          <div className="tw-seg">
            <button
              className={tweaks.density === 'compact' ? 'on' : ''}
              onClick={() => update('density', 'compact')}
            >
              Tight
            </button>
            <button
              className={tweaks.density === 'balanced' ? 'on' : ''}
              onClick={() => update('density', 'balanced')}
            >
              Balanced
            </button>
            <button
              className={tweaks.density === 'roomy' ? 'on' : ''}
              onClick={() => update('density', 'roomy')}
            >
              Roomy
            </button>
          </div>
        </div>
        <div className="tw-row">
          <div className="lbl">Damage SFX</div>
          <div
            className={`tw-toggle ${tweaks.dmgFx ? 'on' : ''}`}
            onClick={() => update('dmgFx', !tweaks.dmgFx)}
          />
        </div>
        <div className="tw-row">
          <div className="lbl">Crit flash</div>
          <div
            className={`tw-toggle ${tweaks.critFx ? 'on' : ''}`}
            onClick={() => update('critFx', !tweaks.critFx)}
          />
        </div>
        <div className="tw-row">
          <div className="lbl">Side</div>
          <div className="tw-seg">
            <button
              className={tweaks.side === 'heroes' ? 'on' : ''}
              onClick={() => update('side', 'heroes')}
            >
              Heroes
            </button>
            <button
              className={tweaks.side === 'director' ? 'on' : ''}
              onClick={() => update('side', 'director')}
            >
              Director
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- App ----------
function App() {
  const [tweaks, setTweaks] = useState({
    theme: 'dark',
    pack: 'chrome',
    density: 'balanced',
    dmgFx: true,
    critFx: true,
    side: 'director',
  });
  const [tweaksOpen, setTweaksOpen] = useState(true);

  const [selHero, setSelHero] = useState('ash');
  const [selMon, setSelMon] = useState('captain');
  const [monsters, setMonsters] = useState(MONSTERS_INIT);
  const [log, setLog] = useState(LOG_INIT);
  const [shaking, setShaking] = useState(null);
  const [crit, setCrit] = useState(false);
  const [lastRoll, setLastRoll] = useState({});
  const [pops, setPops] = useState([]);
  const [logOpen, setLogOpen] = useState(false);
  const [view, setView] = useState('flow');
  const [turnState, setTurnState] = useState({});

  useEffect(() => {
    document.body.dataset.theme = tweaks.theme;
    document.body.dataset.pack = tweaks.pack;
    document.body.dataset.density = tweaks.density;
  }, [tweaks.theme, tweaks.pack, tweaks.density]);

  const activeMon = monsters.find((m) => m.id === selMon) || monsters[0];

  const popDamage = (monId, amt) => {
    const id = Date.now() + Math.random();
    setPops((p) => [...p, { id, monId, amt }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 900);
  };

  const onDamage = useCallback(
    (monId, amt = 5) => {
      setMonsters((ms) =>
        ms.map((m) => {
          if (m.id !== monId) return m;
          const ns = Math.max(0, m.stamina - amt);
          return { ...m, stamina: ns, dead: ns === 0 };
        }),
      );
      if (tweaks.dmgFx) {
        setShaking(monId);
        setTimeout(() => setShaking(null), 450);
        popDamage(monId, amt);
      }
      setLog((l) => [
        {
          who: 'Director',
          txt: `Hand-applied ${amt} damage to ${monsters.find((x) => x.id === monId)?.name}.`,
          t: 'now',
        },
        ...l,
      ]);
    },
    [tweaks.dmgFx, monsters],
  );

  const onRoll = useCallback(
    (ab) => {
      // Fake roll: weight tier 2+
      const d1 = 1 + Math.floor(Math.random() * 10);
      const d2 = 1 + Math.floor(Math.random() * 10);
      const total = d1 + d2 + Number.parseInt(ab.roll.mod, 10);
      let tier = 'T1';
      if (total >= 17) tier = 'T3 CRIT';
      else if (total >= 12) tier = 'T2';
      const display = `${d1}+${d2}${ab.roll.mod}=${total} · ${tier}`;
      setLastRoll((r) => ({ ...r, [ab.id]: display }));
      if (total >= 17 && tweaks.critFx) {
        setCrit(true);
        setTimeout(() => setCrit(false), 700);
      }
      setLog((l) => [
        { who: 'Korva', txt: `Rolled ${ab.name}: ${display}`, t: 'now', crit: total >= 17 },
        ...l,
      ]);
    },
    [tweaks.critFx],
  );

  const onAddCondition = useCallback(
    (c) => {
      setMonsters((ms) =>
        ms.map((m) =>
          m.id === selMon
            ? m.conditions.some((x) => x.name === c.name)
              ? m
              : { ...m, conditions: [...m.conditions, c] }
            : m,
        ),
      );
    },
    [selMon],
  );
  const onRemoveCondition = useCallback(
    (name) => {
      setMonsters((ms) =>
        ms.map((m) =>
          m.id === selMon ? { ...m, conditions: m.conditions.filter((x) => x.name !== name) } : m,
        ),
      );
    },
    [selMon],
  );

  const currentTurn = turnState[selMon] || { main: false, maneuver: false, move: false };
  const onMarkStep = useCallback(
    (step, value) => {
      setTurnState((s) => ({
        ...s,
        [selMon]: {
          ...(s[selMon] || { main: false, maneuver: false, move: false }),
          [step]: value,
        },
      }));
    },
    [selMon],
  );
  const onResetTurn = useCallback(() => {
    setTurnState((s) => ({ ...s, [selMon]: { main: false, maneuver: false, move: false } }));
  }, [selMon]);

  return (
    <>
      <TopBar onOpenTweaks={() => setTweaksOpen(true)} />
      <main className="stage">
        {/* LEFT — heroes + monsters + log */}
        <div className="col left">
          <TurnBar
            side={tweaks.side}
            heroesActed={CAMPAIGN.heroesActed}
            heroesTotal={CAMPAIGN.heroesTotal}
            directorActed={CAMPAIGN.directorActed}
            directorTotal={CAMPAIGN.directorTotal}
            onSwap={() =>
              setTweaks((t) => ({ ...t, side: t.side === 'director' ? 'heroes' : 'director' }))
            }
          />

          <div className="sec">
            <div className="sec-head">
              <h3>
                Party · <b>{PARTY.length} heroes</b>
              </h3>
              <div className="right">click to focus</div>
            </div>
            <div className="sec-body">
              <div className="hrow-list">
                {PARTY.map((h) => (
                  <HeroRow
                    key={h.id}
                    hero={h}
                    active={h.id === selHero}
                    turn={tweaks.side === 'heroes' && !h.acted && h.id === selHero}
                    onClick={() => setSelHero(h.id)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="sec fill">
            <div className="sec-head">
              <h3>
                Encounter · <b>{monsters.filter((m) => !m.dead).length} active</b>
              </h3>
              <div className="right">
                {monsters.filter((m) => m.dead).length} defeated · {CAMPAIGN.directorActed}/
                {CAMPAIGN.directorTotal} acted
              </div>
            </div>
            <div className="sec-body">
              <div className="mongroup">
                <div className="mongroup-head">
                  <h4>Leader</h4>
                  <div className="meta">Solo · Boss</div>
                </div>
                <div className="monrow">
                  {monsters
                    .filter((m) => m.org === 'leader')
                    .sort(sortMon)
                    .map((m) => (
                      <MonRow
                        key={m.id}
                        mon={m}
                        active={m.id === selMon}
                        turn={tweaks.side === 'director' && !m.acted && !m.dead && m.id === selMon}
                        shaking={shaking === m.id}
                        onClick={() => setSelMon(m.id)}
                        onDamage={onDamage}
                      />
                    ))}
                </div>
              </div>
              <div className="mongroup">
                <div className="mongroup-head">
                  <h4>Hexcaller</h4>
                  <div className="meta">Mob · Support</div>
                </div>
                <div className="monrow">
                  {monsters
                    .filter((m) => m.group === 'hexcaller')
                    .sort(sortMon)
                    .map((m) => (
                      <MonRow
                        key={m.id}
                        mon={m}
                        active={m.id === selMon}
                        turn={tweaks.side === 'director' && !m.acted && !m.dead && m.id === selMon}
                        shaking={shaking === m.id}
                        onClick={() => setSelMon(m.id)}
                        onDamage={onDamage}
                      />
                    ))}
                </div>
              </div>
              <div className="mongroup">
                <div className="mongroup-head">
                  <h4>Goblin Skirmisher Squad · A · B · C</h4>
                  <div className="meta">Minions · Harriers</div>
                </div>
                <div className="monrow">
                  {monsters
                    .filter((m) => m.group === 'skirmisher')
                    .sort(sortMon)
                    .map((m) => (
                      <MonRow
                        key={m.id}
                        mon={m}
                        active={m.id === selMon}
                        turn={tweaks.side === 'director' && !m.acted && !m.dead && m.id === selMon}
                        shaking={shaking === m.id}
                        onClick={() => setSelMon(m.id)}
                        onDamage={onDamage}
                      />
                    ))}
                </div>
              </div>
            </div>
          </div>

          <LogRail entries={log.slice(0, 8)} open={logOpen} setOpen={setLogOpen} />
        </div>

        {/* RIGHT — active monster sheet */}
        <div className="col right">
          <StatSheet
            monster={activeMon}
            onRoll={onRoll}
            lastRoll={lastRoll}
            onAddCondition={onAddCondition}
            onRemoveCondition={onRemoveCondition}
            view={view}
            setView={setView}
            turn={currentTurn}
            onMarkStep={onMarkStep}
            onResetTurn={onResetTurn}
          />
        </div>
      </main>

      <Tweaks open={tweaksOpen} setOpen={setTweaksOpen} tweaks={tweaks} setTweaks={setTweaks} />
      <div className={`crit-flash ${crit ? 'go' : ''}`} />
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
