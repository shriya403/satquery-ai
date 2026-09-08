"use client";

import { useEffect, useRef } from "react";
import type { GeoJSON as LeafletGeoJson, ImageOverlay, LatLngBounds, Map } from "leaflet";
import type { AnalysisResponse, DemoDataset } from "@/lib/types";
import { previewUrl } from "@/lib/api";

type MapCanvasProps = {
  dataset: DemoDataset | null;
  response: AnalysisResponse | null;
  showRaster: boolean;
  showOverlay: boolean;
  highlightLargest: boolean;
};

export function MapCanvas({
  dataset,
  response,
  showRaster,
  showOverlay,
  highlightLargest
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const imageRef = useRef<ImageOverlay | null>(null);
  const overlayRef = useRef<LeafletGeoJson | null>(null);
  const boundsRef = useRef<LatLngBounds | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initialiseMap() {
      if (!containerRef.current || mapRef.current) {
        return;
      }

      const leaflet = await import("leaflet");
      if (cancelled || !containerRef.current) {
        return;
      }

      const map = leaflet.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
        minZoom: 8,
        maxZoom: 18
      });
      leaflet.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
      mapRef.current = map;
    }

    initialiseMap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function renderDataset() {
      if (!dataset || !mapRef.current) {
        return;
      }

      const leaflet = await import("leaflet");
      if (cancelled || !mapRef.current) {
        return;
      }

      const [west, south, east, north] = dataset.bounds_wgs84;
      const bounds = leaflet.latLngBounds([south, west], [north, east]);
      boundsRef.current = bounds;

      if (imageRef.current) {
        imageRef.current.remove();
        imageRef.current = null;
      }

      if (showRaster) {
        imageRef.current = leaflet
          .imageOverlay(previewUrl(dataset.dataset_id), bounds, {
            opacity: 0.92,
            interactive: false,
            alt: `${dataset.name} preview`
          })
          .addTo(mapRef.current);
      }

      mapRef.current.fitBounds(bounds, { padding: [18, 18], animate: false });
    }

    renderDataset();

    return () => {
      cancelled = true;
    };
  }, [dataset, showRaster]);

  useEffect(() => {
    let cancelled = false;

    async function renderOverlay() {
      if (!mapRef.current) {
        return;
      }

      const leaflet = await import("leaflet");
      if (cancelled || !mapRef.current) {
        return;
      }

      if (overlayRef.current) {
        overlayRef.current.remove();
        overlayRef.current = null;
      }

      if (!showOverlay || !response?.overlays.length) {
        return;
      }

      overlayRef.current = leaflet
        .geoJSON(response.overlays, {
          style: (feature) => {
            const isLargest = feature?.properties?.id === "water-1";
            return {
              color: isLargest && highlightLargest ? "#f59e0b" : "#38bdf8",
              fillColor: isLargest && highlightLargest ? "#f59e0b" : "#38bdf8",
              fillOpacity: isLargest && highlightLargest ? 0.34 : 0.24,
              opacity: 0.96,
              weight: isLargest && highlightLargest ? 3 : 2
            };
          },
          onEachFeature: (feature, layer) => {
            const props = feature.properties as { id?: string; area_ha?: number; confidence?: number };
            layer.bindPopup(
              `<strong>${props.id ?? "water"}</strong><br/>Area: ${props.area_ha ?? "n/a"} ha<br/>Confidence: ${props.confidence ?? "n/a"}`
            );
          }
        })
        .addTo(mapRef.current);

      const overlayBounds = overlayRef.current.getBounds();
      if (overlayBounds.isValid()) {
        mapRef.current.fitBounds(overlayBounds, { padding: [32, 32], animate: false });
      } else if (boundsRef.current) {
        mapRef.current.fitBounds(boundsRef.current, { padding: [18, 18], animate: false });
      }
    }

    renderOverlay();

    return () => {
      cancelled = true;
    };
  }, [response, showOverlay, highlightLargest]);

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden border border-neutral-700 bg-carbon-900" data-testid="map-shell">
      <div ref={containerRef} className="h-full min-h-[420px]" data-testid="map-canvas" />
      {!dataset ? (
        <div className="absolute inset-0 grid place-items-center bg-carbon-900 text-sm text-neutral-300">
          Start the backend and load a demo dataset.
        </div>
      ) : null}
      <div className="absolute bottom-3 right-3 max-w-[280px] border border-neutral-700 bg-carbon-950/90 px-3 py-2 text-xs text-neutral-200 shadow-workstation">
        <div className="font-semibold text-neutral-50">Legend</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="h-2.5 w-5 border border-signal-cyan bg-signal-cyan/30" />
          <span>Detected water region</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="h-2.5 w-5 border border-signal-amber bg-signal-amber/30" />
          <span>Largest water polygon</span>
        </div>
      </div>
    </div>
  );
}
