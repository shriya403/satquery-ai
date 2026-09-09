"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSON as LeafletGeoJson, ImageOverlay, LatLngBounds, Map } from "leaflet";
import { spectralPreviewUrl } from "../lib/api";
import type { SpectralMode } from "../lib/api";
import type { AnalysisResponse, DemoDataset } from "../lib/types";

type MapCanvasProps = {
  dataset: DemoDataset | null;
  response: AnalysisResponse | null;
  showRaster: boolean;
  rasterMode: SpectralMode;
  showOverlay: boolean;
  highlightLargest: boolean;
  overlayOpacity: number;
  selectedFeatureId: string | null;
  onFeatureSelect: (featureId: string) => void;
};

export function MapCanvas({
  dataset,
  response,
  showRaster,
  rasterMode,
  showOverlay,
  highlightLargest,
  overlayOpacity,
  selectedFeatureId,
  onFeatureSelect
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const imageRef = useRef<ImageOverlay | null>(null);
  const overlayRef = useRef<LeafletGeoJson | null>(null);
  const boundsRef = useRef<LatLngBounds | null>(null);
  const fittedDatasetIdRef = useRef<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

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
        maxZoom: 18,
        keyboard: true
      });
      leaflet.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
      mapRef.current = map;
      setMapReady(true);
    }

    initialiseMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fitDatasetToScene() {
      if (!dataset || !mapRef.current) {
        fittedDatasetIdRef.current = null;
        return;
      }

      const leaflet = await import("leaflet");
      if (cancelled || !mapRef.current) {
        return;
      }

      const [west, south, east, north] = dataset.bounds_wgs84;
      const bounds = leaflet.latLngBounds([south, west], [north, east]);
      boundsRef.current = bounds;

      if (fittedDatasetIdRef.current !== dataset.dataset_id) {
        fittedDatasetIdRef.current = dataset.dataset_id;
        mapRef.current.fitBounds(bounds, { padding: [18, 18], animate: false });
      }
    }

    fitDatasetToScene();

    return () => {
      cancelled = true;
    };
  }, [dataset, mapReady]);

  useEffect(() => {
    let cancelled = false;

    async function renderDatasetImage() {
      if (!mapRef.current) {
        return;
      }

      const leaflet = await import("leaflet");
      if (cancelled || !mapRef.current) {
        return;
      }

      if (imageRef.current) {
        imageRef.current.remove();
        imageRef.current = null;
      }

      if (!dataset || !showRaster) {
        return;
      }

      const [west, south, east, north] = dataset.bounds_wgs84;
      const bounds = leaflet.latLngBounds([south, west], [north, east]);
      boundsRef.current = bounds;

      imageRef.current = leaflet
        .imageOverlay(spectralPreviewUrl(dataset.dataset_id, rasterMode), bounds, {
          opacity: 0.92,
          interactive: false,
          alt: `${dataset.name} ${rasterMode} spectral visualization`,
          className: "spectral-raster-layer"
        })
        .addTo(mapRef.current);
    }

    renderDatasetImage();

    return () => {
      cancelled = true;
    };
  }, [dataset, showRaster, rasterMode, mapReady]);

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

      const largestFeatureId = response.overlays[0]?.properties.id;

      overlayRef.current = leaflet
        .geoJSON(response.overlays, {
          style: (feature) => {
            const featureId = feature?.properties?.id;
            const isLargest = featureId === largestFeatureId;
            const isSelected = featureId === selectedFeatureId;
            const color = isLargest && highlightLargest ? "var(--largest)" : "var(--water)";
            return {
              color,
              fillColor: color,
              fillOpacity: isSelected ? Math.min(overlayOpacity + 0.18, 0.72) : overlayOpacity,
              opacity: 0.96,
              weight: isSelected ? 4 : isLargest && highlightLargest ? 3 : 2,
              className: isLargest && highlightLargest ? "water-polygon-largest" : "water-polygon"
            };
          },
          onEachFeature: (feature, layer) => {
            const props = feature.properties as { id?: string; area_ha?: number; confidence?: number };
            if (props.id) {
              layer.on("click", () => onFeatureSelect(props.id as string));
            }
            layer.bindPopup(
              `<strong>${props.id ?? "water"}</strong><br/>Area: ${props.area_ha ?? "n/a"} ha<br/>Heuristic score: ${
                props.confidence ?? "n/a"
              } (uncalibrated)`
            );
          }
        })
        .addTo(mapRef.current);
    }

    renderOverlay();

    return () => {
      cancelled = true;
    };
  }, [response, showOverlay, highlightLargest, overlayOpacity, selectedFeatureId, onFeatureSelect, mapReady]);

  return (
    <>
      <div ref={containerRef} className="map-canvas" data-testid="map-canvas" />
      {!dataset ? (
        <div className="map-empty">
          Start the backend and load a demo dataset.
        </div>
      ) : null}
      <div className="map-legend" data-testid="map-legend">
        <div className="font-semibold text-[var(--text-primary)]">Legend</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="legend-swatch legend-water" />
          <span>Detected water region</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="legend-swatch legend-largest" />
          <span>Largest water polygon</span>
        </div>
      </div>
    </>
  );
}
