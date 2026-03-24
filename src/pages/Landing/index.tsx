import { useEffect, useLayoutEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useAbout } from "../../contexts/AboutContext";
import styles from "./Landing.module.css";

const STORAGE_KEY = "landing_prefix";

const apps = [
  // text & data
  { path: "/list", name: "list" },
  { path: "/count", name: "count" },
  { path: "/text", name: "text" },
  // media
  { path: "/image", name: "image" },
  { path: "/audio", name: "audio" },
  { path: "/color", name: "color" },
  // audio & music
  { path: "/decibels", name: "decibels" },
  { path: "/tuner", name: "tuner" },
  { path: "/metronome", name: "metronome" },
  // tools & time
  { path: "/timer", name: "timer" },
  { path: "/location", name: "location" },
  { path: "/dice", name: "dice" },
  { path: "/draw", name: "draw" },
];

export default function Landing() {
  const { setContent, setIsOpen } = useAbout();
  const [prefix, setPrefix] = useState(
    () => localStorage.getItem(STORAGE_KEY) ?? "",
  );
  const sizerRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setContent(
      <>
        <p>
          A library of aesthetically-simple, single-purpose utility apps. Simple
          UI, no accounts, no data collection.
        </p>
        <p>
          Click the _ to make it yours — try "my", "dad's", "the world's
          okayest", "dastardly".
        </p>
        <p>
          Requests or feedback?{" "}
          <a
            href="https://github.com/bhdoggett/benapps/issues"
            target="_blank"
            rel="noreferrer"
          >
            Open an issue on GitHub.
          </a>
        </p>
      </>,
    );
    return () => {
      setContent(null);
      setIsOpen(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const sizer = sizerRef.current
    const input = inputRef.current
    if (!sizer || !input) return

    const sync = () => { input.style.width = sizer.offsetWidth + 4 + 'px' }
    sync()

    const ro = new ResizeObserver(sync)
    ro.observe(sizer)
    return () => ro.disconnect()
  }, [prefix]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setPrefix(val);
    localStorage.setItem(STORAGE_KEY, val);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
  }

  return (
    <div className={styles.body}>
      <div className={styles.inner}>
        <span ref={sizerRef} className={styles.prefixSizer} aria-hidden="true">
          {prefix || "_"}
        </span>
        <h1 className={styles.title}>
          <input
            ref={inputRef}
            className={styles.prefixInput}
            value={prefix}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="_"
            maxLength={20}
            autoCapitalize="none"
            aria-label="Customize title"
          />
          <span className={styles.appsSpan}>apps</span>
        </h1>
        <ul className={styles.appList}>
          {apps.map((app) => (
            <li key={app.path}>
              <Link className={styles.appLink} to={app.path}>
                <span className={styles.appName}>{app.name}</span>
                <span className={styles.arrow}>→</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
