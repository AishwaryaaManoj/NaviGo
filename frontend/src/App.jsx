
import { useMemo, useState } from "react";
import "./App.css";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import NaviMap from "./navimap";

// Set VITE_API_BASE_URL in your frontend environment when the backend
// is hosted at a different address.
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const routeData = [
  { id: 1, name: "Metro + Walk", icon: "🚇", minutes: 32, fare: 55, walk: 2.1, transfers: 0, tag: "Recommended", note: "Fast public transport option" },
  { id: 2, name: "BMTC Bus", icon: "🚌", minutes: 40, fare: 35, walk: 1.2, transfers: 0, tag: "Lowest cost", note: "Budget-friendly journey" },
  { id: 3, name: "Metro + Bus", icon: "🚇", minutes: 36, fare: 45, walk: 1.8, transfers: 1, tag: "Balanced", note: "A mix of public transport" },
  { id: 4, name: "Ride Share", icon: "🚕", minutes: 28, fare: 140, walk: 0.2, transfers: 0, tag: "Direct ride", note: "Estimated fare; provider pricing not connected" },
];

const demoStops = [
  { name: "MG Road Metro Station", type: "Metro", distance: "0.4 km", detail: "Purple Line" },
  { name: "Trinity Metro Station", type: "Metro", distance: "0.8 km", detail: "Purple Line" },
  { name: "MG Road Bus Stop", type: "Bus", distance: "0.2 km", detail: "Sample stop information" },
  { name: "Shivajinagar Bus Stand", type: "Bus", distance: "1.1 km", detail: "Sample stop information" },
];

const nav = [
  { name: "Home", icon: "⌂" },
  { name: "Map", icon: "◎" },
  { name: "Routes", icon: "⇄" },
  { name: "Weather", icon: "☼" },
  { name: "Profile", icon: "♙" },
];

const initialSaved = ["Home", "College"];

export default function App() {
  const [theme, setTheme] = useState("dark");
  const [page, setPage] = useState("Home");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("Recommended");
  const [stopFilter, setStopFilter] = useState("All");
  const [saved, setSaved] = useState(initialSaved);
  const [showAllStops, setShowAllStops] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(routeData[0]);
  const [notice, setNotice] = useState("");
  const [rainMode, setRainMode] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("idle");
  const [nearbyStops, setNearbyStops] = useState([]);
  const [selectedStop, setSelectedStop] = useState(null);

  const [stopsLoading, setStopsLoading] = useState(false);
  const [stopsError, setStopsError] = useState("");

  // The displayed routes change when a journey is searched.
  const [displayRoutes, setDisplayRoutes] = useState(routeData);
  const [routeLoading, setRouteLoading] = useState(false);

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus("unavailable");
      return;
    }

    setLocationStatus("loading");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;

        setUserLocation({ latitude, longitude });
        setOrigin("Finding your address...");

        fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`
        )
          .then((response) => {
            if (!response.ok) {
              throw new Error("Could not find address");
            }
            return response.json();
          })
          .then((data) => {
            setOrigin(
              data.display_name || `${latitude}, ${longitude}`
            );
          })
          .catch(() => {
            setOrigin(`${latitude}, ${longitude}`);
          });

        fetchNearbyStops(latitude, longitude);
        setLocationStatus("success");
      },
      () => {
        setLocationStatus("unavailable");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };

  const fetchNearbyStops = async (latitude, longitude) => {
    setStopsLoading(true);
    setStopsError("");

    const query = `
      [out:json][timeout:20];
      (
        node["highway"="bus_stop"](around:1500,${latitude},${longitude});
        node["railway"="station"](around:1500,${latitude},${longitude});
        node["railway"="subway_entrance"](around:1500,${latitude},${longitude});
        node["station"="subway"](around:1500,${latitude},${longitude});
      );
      out body;
    `;

    try {
      const response = await fetch(
        "https://overpass-api.de/api/interpreter",
        {
          method: "POST",
          body: new URLSearchParams({ data: query }),
        }
      );

      if (!response.ok) {
        throw new Error("Transport data is temporarily unavailable.");
      }

      const data = await response.json();

      const results = (data.elements || []).map((item) => {
        const tags = item.tags || {};
        const isMetro =
          tags.station === "subway" ||
          tags.railway === "station" ||
          tags.railway === "subway_entrance";

        const distanceKm =
          6371 *
          2 *
          Math.asin(
            Math.sqrt(
              Math.sin(
                ((item.lat - latitude) * Math.PI) / 360
              ) ** 2 +
              Math.cos((latitude * Math.PI) / 180) *
              Math.cos((item.lat * Math.PI) / 180) *
              Math.sin(
                ((item.lon - longitude) * Math.PI) / 360
              ) ** 2
            )
          );

        return {
          name:
            tags.name ||
            (isMetro ? "Unnamed metro station" : "Unnamed bus stop"),
          type: isMetro ? "Metro" : "Bus",
          detail:
            tags.network ||
            tags.operator ||
            (isMetro ? "Metro station" : "Bus stop"),
          latitude: item.lat,
          longitude: item.lon,
          distance: `${distanceKm.toFixed(1)} km`,
        };
      });

      setNearbyStops(results);
    } catch (error) {
      setStopsError(
        error.message || "Could not load nearby transport stops."
      );
    } finally {
      setStopsLoading(false);
    }
  };

  // Geocode the entered locations, calculate road distance, and request
  // estimated fares from the NaviGo backend.
  async function planJourney(e) {
    e.preventDefault();

    if (!origin.trim() || !destination.trim()) {
      setNotice("Enter both your starting point and destination.");
      return;
    }

    setRouteLoading(true);
    setNotice("");

    try {
      async function geocode(place) {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(place)}`
        );

        if (!response.ok) {
          throw new Error(
            "Location search is temporarily unavailable. Please try again."
          );
        }

        const results = await response.json();

        if (!results.length) {
          throw new Error(`Couldn't find this location: ${place}`);
        }

        return results[0];
      }

      const [start, end] = await Promise.all([
        geocode(origin.trim()),
        geocode(destination.trim()),
      ]);

      const routeResponse = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=false`
      );

      if (!routeResponse.ok) {
        throw new Error("Couldn't calculate the road distance.");
      }

      const roadData = await routeResponse.json();

      if (!roadData.routes?.length) {
        throw new Error("No road route was found for these locations.");
      }

      const distanceKm = roadData.routes[0].distance / 1000;

      if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
        throw new Error(
          "The locations must be different to calculate a journey."
        );
      }

      const response = await fetch(
        `${API_BASE_URL}/routes/compare?distance_km=${distanceKm.toFixed(2)}&walking_distance_km=0`
      );

      if (!response.ok) {
        throw new Error(
          `Backend request failed (${response.status}). Check the backend URL and CORS settings.`
        );
      }

      const data = await response.json();

      if (!Array.isArray(data.routes) || data.routes.length === 0) {
        throw new Error("The backend did not return any route estimates.");
      }

      const speeds = {
        "Bike taxi": 25,
        Auto: 20,
        Cab: 28,
      };

      const icons = {
        "Bike taxi": "🏍️",
        Auto: "🛺",
        Cab: "🚕",
      };

      const mappedRoutes = data.routes.map((route, index) => ({
        id: index + 1,
        name: route.mode,
        icon: icons[route.mode] || "🚘",
        minutes: Math.max(
          1,
          Math.round(
            (distanceKm / (speeds[route.mode] || 20)) * 60
          )
        ),
        fare: route.estimated_fare_inr,
        walk: route.estimated_walking_km,
        transfers: 0,
        tag:
          route.mode === data.cheapest_mode
            ? "Lowest cost"
            : "Estimated fare",
        note: route.source || "NaviGo prototype estimate",
      }));

      setDisplayRoutes(mappedRoutes);
      setFilter("All");
      setSort("Recommended");
      setSelectedRoute(mappedRoutes[0]);
      setPage("Routes");
      setNotice(
        `Road distance: ${distanceKm.toFixed(1)} km. Fares are illustrative backend estimates, and travel times are approximations—not live provider quotes.`
      );
    } catch (error) {
      setNotice(
        `${error.message} Check that the backend is running, its URL is reachable, and CORS permits frontend requests.`
      );
    } finally {
      setRouteLoading(false);
    }
  }

  const routes = useMemo(() => {
    let list = displayRoutes.filter((r) => {
      if (filter === "Metro") return r.name.includes("Metro");
      if (filter === "Bus") return r.name.includes("Bus");
      if (filter === "Walk") return r.walk > 0;

      if (filter === "Ride") {
        return ["Bike taxi", "Auto", "Cab", "Ride Share"].includes(r.name);
      }

      return true;
    });

    if (sort === "Fastest") {
      list = [...list].sort((a, b) => a.minutes - b.minutes);
    }

    if (sort === "Cheapest") {
      list = [...list].sort((a, b) => a.fare - b.fare);
    }

    if (sort === "Least walking") {
      list = [...list].sort((a, b) => a.walk - b.walk);
    }

    return list;
  }, [filter, sort, displayRoutes]);

  const stopsSource = nearbyStops.length > 0 ? nearbyStops : demoStops;

  const stops = stopsSource.filter((s) => {
    if (stopFilter === "All") return true;
    return s.type === stopFilter;
  });

  function openPage(name) {
    setPage(name);
    setNotice("");
  }

  function toggleSaved(name) {
    setSaved((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name]
    );
  }

  function usePlace(place) {
    setOrigin(place);
    setNotice(`${place} added as your starting point.`);
    setPage("Home");
  }

  return (
    <div className={`app ${theme}`}>
      <header className="topbar">
        <button
          className="brand"
          onClick={() => openPage("Home")}
          aria-label="NaviGo home"
        >
          <span className="brand-mark">⌖</span>
          <span>Navi<span className="brand-accent">Go</span></span>
        </button>

        <span className="city-pill">⌖ Bengaluru</span>

        <button
          className="theme-toggle"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Switch theme"
          title="Switch light and dark themes"
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </header>

      <main className="main-content">
        {page === "Home" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow">
                  SMART · CONNECTED · SUSTAINABLE
                </span>
                <h1>Your city.<br />Your journey.<br /><span>Smarter.</span></h1>
                <p>
                  Compare ways to travel across Bengaluru. Find transport
                  options, understand estimated costs, and plan around
                  the weather.
                </p>
                <span className="planned-label">
                  MOBILE TRANSPORT PLANNER
                </span>
              </div>

              <div className="hero-art">
                <div className="sun-glow" />
                <div className="hero-city">BENGALURU</div>
                <div className="transport-art">
                  <span>✈️</span><span>🚌</span><span>🚇</span>
                </div>
                <div className="hero-caption">MOVE BETTER. LIVE SMARTER.</div>
              </div>
            </section>

            <WeatherStrip onOpen={() => openPage("Weather")} />

            <section className="planner-panel">
              <SectionHeading
                kicker="LET'S GET YOU THERE"
                title="Plan your journey"
              />

              <form onSubmit={planJourney}>
                <LocationInput
                  label="FROM"
                  value={origin}
                  onChange={setOrigin}
                  placeholder="Starting location"
                  color="blue"
                />

                <button
                  type="button"
                  className="outline-button"
                  onClick={detectLocation}
                  disabled={locationStatus === "loading"}
                >
                  {locationStatus === "loading"
                    ? "Finding your location..."
                    : "📍 Use my location"}
                </button>

                {locationStatus === "success" && (
                  <p className="demo-label">
                    Location detected successfully!
                  </p>
                )}

                {locationStatus === "unavailable" && (
                  <p className="demo-label">
                    Location unavailable. Please allow location access
                    or enter your starting point.
                  </p>
                )}

                <div className="route-connector" />

                <LocationInput
                  label="TO"
                  value={destination}
                  onChange={setDestination}
                  placeholder="Where do you want to go?"
                  color="orange"
                />

                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setOrigin(destination);
                    setDestination(origin);
                  }}
                >
                  ↕ Swap locations
                </button>

                <button
                  className="primary-button"
                  type="submit"
                  disabled={routeLoading}
                >
                  {routeLoading
                    ? "Finding routes..."
                    : <>Find my route <span>→</span></>}
                </button>
              </form>

              <p className="demo-note">
                Locations are searched using OpenStreetMap. Road distance
                is used to request prototype fare estimates; live transit
                routes and provider fares are not connected.
              </p>
            </section>

            <section className="quick-grid">
              {[
                ["🚌", "Bus stops", "Nearby BMTC", "Map"],
                ["🚇", "Metro stations", "Find a station", "Map"],
                ["🌦️", "Weather", "Travel advice", "Weather"],
                ["🚕", "Ride booking", "Compare options", "Ride booking"],
              ].map(([icon, title, subtitle, target]) => (
                <button
                  className="quick-card"
                  key={title}
                  onClick={() => openPage(target)}
                >
                  <span className="quick-icon">{icon}</span>
                  <strong>{title}</strong>
                  <span>{subtitle}</span>
                </button>
              ))}
            </section>

            <section className="routes-section">
              <SectionHeading kicker="YOUR TRAVEL SPACE" title="Saved places" />
              <div className="saved-place-row">
                {saved.map((place) => (
                  <button
                    className="saved-place"
                    key={place}
                    onClick={() => usePlace(place)}
                  >
                    <span>⌖</span><span>{place}</span><span>→</span>
                  </button>
                ))}

                <button
                  className="saved-place add-place"
                  onClick={() => {
                    const place = window.prompt("Name a place to save:");
                    if (place?.trim()) toggleSaved(place.trim());
                  }}
                >
                  ＋ Add place
                </button>
              </div>
            </section>

            <section className="routes-section">
              <SectionHeading
                kicker="QUICK COMPARISON"
                title="Popular route options"
              />

              <RouteCards
                routes={routeData.slice(0, 3)}
                onSelect={(route) => {
                  setSelectedRoute(route);
                  openPage("Route details");
                }}
              />

              <button
                className="outline-button"
                onClick={() => openPage("Routes")}
              >
                Compare all routes →
              </button>
            </section>
          </>
        )}

        {page === "Routes" && (
          <>
            <PageIntro
              kicker="JOURNEY PLANNER"
              title="Compare your routes"
              subtitle={`${origin || "Your starting point"} → ${destination || "Your destination"}`}
            />

            <div className="notice">
              After a journey search, these results use NaviGo backend
              fare estimates for bike taxis, autos and cabs. Metro/bus
              routing, live traffic, actual schedules and live fares
              are not connected.
            </div>

            <div className="sort-row">
              {["Recommended", "Fastest", "Cheapest", "Least walking"].map((s) => (
                <button
                  className={`filter-chip ${sort === s ? "selected" : ""}`}
                  key={s}
                  onClick={() => setSort(s)}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="filter-row">
              {["All", "Metro", "Bus", "Walk", "Ride"].map((f) => (
                <button
                  className={`filter-chip ${filter === f ? "selected" : ""}`}
                  key={f}
                  onClick={() => setFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>

            <RouteCards
              routes={routes}
              onSelect={(route) => {
                setSelectedRoute(route);
                openPage("Route details");
              }}
            />

            <div className="info-panel">
              <strong>How NaviGo compares routes</strong>
              <p>
                Fares come from the prototype backend. Travel times are
                approximations based on assumed average speeds, not live
                traffic. Walking distances are backend estimates, not
                measured walking routes.
              </p>
            </div>
          </>
        )}

        {page === "Route details" && (
          <>
            <PageIntro
              kicker="JOURNEY BREAKDOWN"
              title={selectedRoute.name}
              subtitle={`${origin || "Origin"} → ${destination || "Destination"}`}
            />

            <div className="route-detail-hero">
              <span className="route-icon large">{selectedRoute.icon}</span>
              <div>
                <strong>{selectedRoute.minutes} min</strong>
                <p>Approximate travel time</p>
              </div>
              <div>
                <strong>₹{selectedRoute.fare}</strong>
                <p>Estimated fare</p>
              </div>
            </div>

            <div className="planner-panel">
              <SectionHeading kicker="YOUR JOURNEY" title="Route steps" />
              <TimelineStep
                title={origin || "Starting location"}
                detail="Start your journey"
              />
              <TimelineStep
                title={selectedRoute.name}
                detail={`${selectedRoute.transfers} transfers · estimated option`}
              />
              <TimelineStep
                title="Walking section"
                detail={`${selectedRoute.walk} km estimated walking`}
              />
              <TimelineStep
                title={destination || "Destination"}
                detail="Arrive at your destination"
                last
              />

              <div className="notice">
                These are estimates, not turn-by-turn directions or
                confirmed transport routes.
              </div>

              <button
                className="primary-button"
                onClick={() => openPage("Map")}
              >
                View map <span>→</span>
              </button>

              <button
                className="outline-button"
                onClick={() =>
                  toggleSaved(
                    `${origin || "Origin"} → ${destination || "Destination"}`
                  )
                }
              >
                {saved.includes(
                  `${origin || "Origin"} → ${destination || "Destination"}`
                )
                  ? "✓ Journey saved"
                  : "☆ Save journey"}
              </button>
            </div>
          </>
        )}

        {page === "Map" && (
          <>
            <PageIntro
              kicker="EXPLORE BENGALURU"
              title="Map & nearby stops"
              subtitle="Explore transport points around your area."
            />

            <div className="map-panel">
              <NaviMap
                nearbyStops={nearbyStops}
                selectedStop={selectedStop}
                onStopSelect={setSelectedStop}
                userLocation={userLocation}
                destination={destination}
              />
            </div>

            <div className="filter-row">
              {["All", "Bus", "Metro"].map((f) => (
                <button
                  className={`filter-chip ${stopFilter === f ? "selected" : ""}`}
                  key={f}
                  onClick={() => setStopFilter(f)}
                >
                  {f === "All"
                    ? "All stops"
                    : f === "Bus"
                      ? "BMTC buses"
                      : "Metro stations"}
                </button>
              ))}
            </div>

            <section className="routes-section">
              <SectionHeading
                kicker="NEARBY TRANSPORT"
                title="Stops & stations"
              />

              {stopsLoading && (
                <p className="demo-label">Loading nearby stops...</p>
              )}

              {stopsError && (
                <div className="notice">{stopsError}</div>
              )}

              {(showAllStops ? stops : stops.slice(0, 3)).map((stop) => (
                <article
                  className="stop-card clickable-stop"
                  key={`${stop.name}-${stop.latitude ?? stop.distance}`}
                  onClick={() => {
                    if (stop.latitude != null && stop.longitude != null) {
                      setSelectedStop(stop);
                      setPage("Map");
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (
                      (e.key === "Enter" || e.key === " ") &&
                      stop.latitude != null &&
                      stop.longitude != null
                    ) {
                      e.preventDefault();
                      setSelectedStop(stop);
                      setPage("Map");
                    }
                  }}
                >
                  <span className="route-icon">
                    {stop.type === "Metro" ? "🚇" : "🚌"}
                  </span>

                  <div className="route-info">
                    <strong>{stop.name}</strong>
                    <span>{stop.detail}</span>
                    <span className="demo-label">
                      {nearbyStops.length > 0
                        ? "OpenStreetMap data"
                        : "Sample data"}
                    </span>
                  </div>

                  <span className="stop-distance">{stop.distance}</span>
                </article>
              ))}

              <button
                className="outline-button"
                onClick={() => setShowAllStops(!showAllStops)}
              >
                {showAllStops ? "Show fewer" : "View all stops"}
              </button>
            </section>

            <div className="notice">
              Nearby stops are retrieved from OpenStreetMap when location
              access is granted. Coverage and stop classifications may vary.
            </div>
          </>
        )}

        {page === "Weather" && (
          <>
            <PageIntro
              kicker="PLAN AHEAD"
              title="Weather & travel tips"
              subtitle="Prepare for outdoor walking and transfers."
            />

            <div className="weather-large">
              <span className="weather-big-icon">🌤️</span>
              <div>
                <span className="section-kicker">BENGALURU</span>
                <h2>Weather preview</h2>
                <p>Live forecast not connected</p>
              </div>
              <span className="planned-label">DEMO</span>
            </div>

            <div className="weather-metrics">
              <Metric icon="💧" label="Humidity" value="--" />
              <Metric icon="💨" label="Wind" value="--" />
              <Metric icon="🌧️" label="Rain chance" value="--" />
            </div>

            <div className="planner-panel">
              <SectionHeading
                kicker="WALKING PREFERENCE"
                title="Weather-aware routing"
              />
              <p className="muted-copy">
                When connected to a forecast service, NaviGo can flag rain
                or heat and prefer routes with less outdoor walking where
                route data supports the comparison.
              </p>

              <button
                className={`filter-chip ${rainMode ? "selected" : ""}`}
                onClick={() => setRainMode(!rainMode)}
              >
                {rainMode
                  ? "✓ Prefer less walking (demo)"
                  : "Enable less-walking preference"}
              </button>

              {rainMode && (
                <div className="notice">
                  Demo preference enabled. Live weather and route ranking
                  are not connected.
                </div>
              )}
            </div>

            <div className="routes-section">
              <SectionHeading kicker="TRAVEL CHECKLIST" title="Before you leave" />
              <Advice
                icon="☂️"
                title="Check the forecast"
                text="Consider carrying an umbrella if rain is expected."
              />
              <Advice
                icon="👟"
                title="Plan walking sections"
                text="Choose comfortable footwear and review walking distance."
              />
              <Advice
                icon="🚇"
                title="Check transit updates"
                text="Confirm service updates through official transit sources."
              />
            </div>
          </>
        )}

        {page === "Ride booking" && (
          <>
            <PageIntro
              kicker="CONTINUE YOUR JOURNEY"
              title="Ride booking"
              subtitle="Choose a supported ride service."
            />

            <div className="notice">
              These are external-service links. Live availability and provider
              fares are not available through this prototype.
            </div>

            {[
              {
                name: "Uber",
                icon: "🚘",
                desc: "Open Uber to check rides",
                url: "https://m.uber.com/",
              },
              {
                name: "Ola",
                icon: "🚕",
                desc: "Open Ola to check rides",
                url: "https://www.olacabs.com/",
              },
              {
                name: "Rapido",
                icon: "🏍️",
                desc: "Open Rapido to check rides",
                url: "https://www.rapido.bike/",
              },
            ].map((ride) => (
              <article className="ride-card" key={ride.name}>
                <span className="ride-logo">{ride.icon}</span>
                <div className="route-info">
                  <strong>{ride.name}</strong>
                  <span>{ride.desc}</span>
                  <span className="demo-label">Provider website</span>
                </div>
                <button
                  className="small-button"
                  onClick={() =>
                    window.open(ride.url, "_blank", "noopener,noreferrer")
                  }
                >
                  Open ↗
                </button>
              </article>
            ))}

            <div className="info-panel">
              <strong>Fare estimates</strong>
              <p>
                Displayed ride fares are example backend estimates, not
                quotes from ride-hailing providers.
              </p>
            </div>
          </>
        )}

        {page === "Profile" && (
          <>
            <PageIntro
              kicker="YOUR ACCOUNT"
              title="Your travel space"
              subtitle="Personalise your NaviGo experience."
            />

            <div className="profile-card">
              <span className="avatar">N</span>
              <div>
                <strong>NaviGo traveller</strong>
                <span>Local prototype profile</span>
              </div>
            </div>

            {[
              ["🧭", "My journeys", "Review and save planned routes"],
              ["☆", "Saved locations", `${saved.length} saved places`],
              ["⚙️", "Preferences", "Theme and travel preferences"],
              ["🔔", "Service updates", "Notifications integration planned"],
              ["ⓘ", "About NaviGo", "Weather-aware smart mobility planner"],
            ].map(([icon, title, detail]) => (
              <button
                className="settings-row"
                key={title}
                onClick={() => {
                  if (title === "Saved locations") {
                    openPage("Saved locations");
                  } else if (title === "Preferences") {
                    openPage("Preferences");
                  } else {
                    setNotice(`${title}: ${detail}.`);
                  }
                }}
              >
                <span>{icon}</span>
                <span className="route-info">
                  <strong>{title}</strong>
                  <span>{detail}</span>
                </span>
                <span>›</span>
              </button>
            ))}

            {notice && <div className="notice">{notice}</div>}
          </>
        )}

        {page === "Saved locations" && (
          <>
            <PageIntro
              kicker="QUICK ACCESS"
              title="Saved locations"
              subtitle="Use frequently visited places as journey inputs."
            />

            {saved.map((place) => (
              <div className="saved-row" key={place}>
                <span>📍</span>
                <strong>{place}</strong>
                <button
                  className="small-button"
                  onClick={() => usePlace(place)}
                >
                  Use
                </button>
                <button
                  className="remove-button"
                  onClick={() => toggleSaved(place)}
                >
                  ×
                </button>
              </div>
            ))}

            <button
              className="primary-button"
              onClick={() => {
                const place = window.prompt("Enter a place name:");
                if (place?.trim()) toggleSaved(place.trim());
              }}
            >
              ＋ Add a location
            </button>
          </>
        )}

        {page === "Preferences" && (
          <>
            <PageIntro
              kicker="PERSONALISE NAVIGO"
              title="Preferences"
              subtitle="Adjust your prototype settings."
            />

            <div className="settings-row">
              <span>🎨</span>
              <span className="route-info">
                <strong>Appearance</strong>
                <span>Choose a theme</span>
              </span>
              <button
                className="small-button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? "Dark" : "Light"} · Switch
              </button>
            </div>

            <div className="settings-row">
              <span>🚶</span>
              <span className="route-info">
                <strong>Less walking</strong>
                <span>Weather-aware preference</span>
              </span>
              <button
                className="small-button"
                onClick={() => setRainMode(!rainMode)}
              >
                {rainMode ? "On" : "Off"}
              </button>
            </div>

            <div className="notice">
              Preferences are local to this prototype session.
              Account syncing is not implemented.
            </div>
          </>
        )}

        {notice && page !== "Profile" && (
          <div className="notice global-notice">{notice}</div>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        {nav.map((item) => (
          <button
            key={item.name}
            className={`nav-item ${page === item.name ? "active" : ""}`}
            onClick={() => openPage(item.name)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.name}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function SectionHeading({ kicker, title }) {
  return (
    <div className="section-heading">
      <div>
        <span className="section-kicker">{kicker}</span>
        <h2>{title}</h2>
      </div>
      <span className="heading-icon">↗</span>
    </div>
  );
}

function PageIntro({ kicker, title, subtitle }) {
  return (
    <section className="page-intro">
      <span className="section-kicker">{kicker}</span>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </section>
  );
}

function LocationInput({ label, value, onChange, placeholder, color }) {
  return (
    <label className="location-field">
      <span className={`location-dot ${color}`} />
      <span className="field-copy">
        <span>{label}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      </span>
    </label>
  );
}

function WeatherStrip({ onOpen }) {
  return (
    <button className="weather-strip" onClick={onOpen}>
      <span className="weather-icon">🌤️</span>
      <span className="weather-copy">
        <strong>Bengaluru weather</strong>
        <span>Forecast integration planned</span>
      </span>
      <span className="weather-temp">--°C</span>
      <span>→</span>
    </button>
  );
}

function RouteCards({ routes, onSelect }) {
  if (!routes.length) {
    return (
      <div className="info-panel">
        No routes match this filter. Try another transport option.
      </div>
    );
  }

  return (
    <div className="route-list">
      {routes.map((route) => (
        <article className="route-card" key={route.id}>
          <span className="route-icon">{route.icon}</span>

          <div className="route-info">
            <strong>{route.name}</strong>
            <span>
              {route.walk} km walking · {route.transfers} transfers
            </span>
            <span className="route-tag">{route.tag}</span>
          </div>

          <div className="route-price">
            <strong>{route.minutes} min</strong>
            <span>₹{route.fare}</span>
            <small>estimated</small>
            <button
              className="details-link"
              onClick={() => onSelect(route)}
            >
              Details →
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function TimelineStep({ title, detail, last }) {
  return (
    <div className={`timeline-step ${last ? "last" : ""}`}>
      <span className="timeline-dot" />
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}

function Metric({ icon, label, value }) {
  return (
    <div className="metric-card">
      <span>{icon}</span>
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  );
}

function Advice({ icon, title, text }) {
  return (
    <article className="advice-card">
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </article>
  );
}
