import numpy as np

from satquery.geospatial.indices import calculate_ndbi, calculate_ndvi, calculate_ndwi


def test_calculate_ndwi_known_values() -> None:
    green = np.array([[0.3, 0.1]], dtype=np.float32)
    nir = np.array([[0.1, 0.3]], dtype=np.float32)

    ndwi = calculate_ndwi(green, nir)

    np.testing.assert_allclose(ndwi, np.array([[0.5, -0.5]], dtype=np.float32), rtol=1e-6)


def test_calculate_ndvi_and_ndbi_known_values() -> None:
    nir = np.array([[0.6]], dtype=np.float32)
    red = np.array([[0.2]], dtype=np.float32)
    swir = np.array([[0.3]], dtype=np.float32)

    np.testing.assert_allclose(calculate_ndvi(nir, red), np.array([[0.5]], dtype=np.float32), rtol=1e-6)
    np.testing.assert_allclose(calculate_ndbi(swir, nir), np.array([[-0.33333334]], dtype=np.float32), rtol=1e-6)


def test_index_returns_nan_for_zero_division() -> None:
    green = np.array([[0.0]], dtype=np.float32)
    nir = np.array([[0.0]], dtype=np.float32)

    assert np.isnan(calculate_ndwi(green, nir)[0, 0])
