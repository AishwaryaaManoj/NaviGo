
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import React from "react";



const busIcon = new L.DivIcon({
  className: "",
  html: '<div style="background:#168ec8;color:white;border-radius:50%;width:34px;height:34px;display:grid;place-items:center;border:3px solid white;box-shadow:0 2px 8px #0004;font-size:17px">🚌</div>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

const metroIcon = new L.DivIcon({
  className: "",
  html: '<div style="background:#f07835;color:white;border-radius:50%;width:34px;height:34px;display:grid;place-items:center;border:3px solid white;box-shadow:0 2px 8px #0004;font-size:17px">🚇</div>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

const demoStops = [
  {
    name: "Majestic Metro Station",
    type: "Metro",
    position: [12.9767, 77.5713],
  },
  {
    name: "Vidhana Soudha Metro Station",
    type: "Metro",
    position: [12.9796, 77.5913],
  },
  {
    name: "Kempegowda Bus Station",
    type: "BMTC / Bus",
    position: [12.9767, 77.5711],
  },
];
function MapFocus({ selectedStop }) {
  const map = useMap();

  React.useEffect(() => {
    if (
      selectedStop &&
      selectedStop.latitude != null &&
      selectedStop.longitude != null
    ) {
      map.flyTo(
        [selectedStop.latitude, selectedStop.longitude],
        16,
        { duration: 1 }
      );
    }
  }, [selectedStop, map]);

  return null;
}

function RouteFinder({ userLocation, destination }) {
  const map = useMap();

  React.useEffect(() => {
    if (!userLocation || !destination) return;

    const control = L.Routing.control({
      waypoints: [
        L.latLng(userLocation.latitude, userLocation.longitude),
        L.latLng(destination.latitude, destination.longitude),
      ],
      routeWhileDragging: false,
      show: true,
      addWaypoints: false,
      createMarker: () => null,
    }).addTo(map);

    return () => {
      map.removeControl(control);
    };
  }, [map, userLocation, destination]);

  return null;
}

function RecenterButton({ userLocation }) {
  const map = useMap();

  return (
    <button
      type="button"
      className="map-location-button"
      onClick={() => {
        if (userLocation) {
          map.flyTo(
            [userLocation.latitude, userLocation.longitude],
            15,
            { duration: 1 }
          );
        }
      }}
      disabled={!userLocation}
      aria-label="Center map on my location"
      title="Center map on my location"
    >
      📍 My Location
    </button>
  );
}
export default function NaviMap({
  nearbyStops = [],
  selectedStop,
  onStopSelect,
  userLocation,
  destination,
}) {
  return (
    <div className="navimap">
      <MapContainer
  center={[12.9716, 77.5946]}
  zoom={12}
  scrollWheelZoom={false}
  style={{ height: "100%", width: "100%" }}
>
  <MapFocus selectedStop={selectedStop} />
  
<RouteFinder
  userLocation={userLocation}
  destination={destination}
/>

  <RecenterButton userLocation={userLocation} />

  
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {nearbyStops.map((stop) => (
          <Marker
            key={stop.name}
            position={[stop.latitude, stop.longitude]}
            icon={stop.type === "Metro" ? metroIcon : busIcon}
          >
            <Popup>
  <strong>{stop.name}</strong>
  <br />
  <span>
    {stop.type === "Metro" ? "🚇 Metro Station" : "🚌 Bus Stop"}
  </span>
  <br />
  <small>{stop.detail || "Nearby transport stop"}</small>
  <br />
  <small>Distance: {stop.distance || "Not available"}</small>
</Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
