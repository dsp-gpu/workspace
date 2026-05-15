# ENABLE_ROCM cleanup — две группы файлов (2026-05-15)

> Снапшот разведки перед удалением `#if ENABLE_ROCM` guard'ов из 9 репо.
> Задача отложена Alex до завтра. Этот файл — пред-разбиение на 2 стратегии обработки.

## Подсчёт

| Группа | Файлов |
|--------|--------|
| 1. Простые (`#if ENABLE_ROCM ... #endif` без `#else`) | 199 |
| 2a. С `#else` (CPU-stub ветка) | 47 |
| 2b. С `#if !ENABLE_ROCM` (OpenCL legacy блок) | 7 |
| 2c. Смешанные (`#else` + `#if !ENABLE_ROCM` в одном файле) | 0 |
| **ИТОГО** | **253** |

## Стратегия обработки

**Группа 1** (простая) — массовая операция:
- удалить строки `#if ENABLE_ROCM` и `#endif // ENABLE_ROCM`
- содержимое между ними оставить как есть
- риск минимальный, можно скриптом через regex

**Группа 2** (с ветвлением) — ручная или полу-ручная:
- `#else` ветки = CPU-stub (для сборки без ROCm) → удалить
- `#if !ENABLE_ROCM` блоки = OpenCL legacy / CPU-only → удалить **весь блок**
- проверять что не остаётся «висящих» классов (stub class FftStub и т.п.)

---

## Группа 1: ПРОСТЫЕ (199 файлов)

- `core/include/core/backends/rocm/hsa_interop.hpp`
- `core/include/core/backends/rocm/rocm_backend.hpp`
- `core/include/core/backends/rocm/rocm_core.hpp`
- `core/include/core/backends/rocm/stream_pool.hpp`
- `core/include/core/drv_gpu.hpp`
- `core/include/core/interface/gpu_context.hpp`
- `core/include/core/memory/hip_buffer.hpp`
- `core/include/core/services/buffer_set.hpp`
- `core/include/core/services/gpu_benchmark_base.hpp`
- `core/include/core/services/gpu_kernel_op.hpp`
- `core/include/core/services/profiling/scoped_profile_timer.hpp`
- `core/include/core/services/scoped_hip_event.hpp`
- `core/python/dsp_core_module.cpp`
- `core/python/py_gpu_context.hpp`
- `core/src/backends/hybrid/hybrid_backend.cpp`
- `core/src/backends/rocm/hsa_interop.cpp`
- `core/src/backends/rocm/rocm_backend.cpp`
- `core/src/backends/rocm/rocm_core.cpp`
- `core/src/backends/rocm/stream_pool.cpp`
- `core/src/backends/rocm/zero_copy_bridge.cpp`
- `core/src/gpu_context.cpp`
- `core/src/gpu_kernel_op.cpp`
- `core/src/services/compile_key.cpp`
- `core/src/services/profiling/scoped_profile_timer.cpp`
- `core/test_utils/gpu_transfer.hpp`
- `core/tests/all_test.hpp`
- `core/tests/test_drv_gpu_external.hpp`
- `core/tests/test_hybrid_backend.hpp`
- `core/tests/test_hybrid_external_context.hpp`
- `core/tests/test_rocm_backend.hpp`
- `core/tests/test_rocm_external_context.hpp`
- `core/tests/test_zero_copy.hpp`
- `heterodyne/include/dsp/heterodyne/kernels/heterodyne_kernels_rocm.hpp`
- `heterodyne/python/dsp_heterodyne_module.cpp`
- `heterodyne/src/heterodyne/heterodyne_dechirp.cpp`
- `heterodyne/tests/all_test.hpp`
- `heterodyne/tests/heterodyne_benchmark_rocm.hpp`
- `heterodyne/tests/test_heterodyne_benchmark_rocm.hpp`
- `linalg/include/dsp/linalg/capon_types.hpp`
- `linalg/include/dsp/linalg/diagonal_load_regularizer.hpp`
- `linalg/include/dsp/linalg/kernels/capon_kernels_rocm.hpp`
- `linalg/include/dsp/linalg/kernels/diagonal_load_kernel_rocm.hpp`
- `linalg/include/dsp/linalg/kernels/symmetrize_kernel_sources_rocm.hpp`
- `linalg/include/dsp/linalg/operations/adapt_beam_op.hpp`
- `linalg/include/dsp/linalg/operations/capon_invert_op.hpp`
- `linalg/include/dsp/linalg/operations/capon_relief_op.hpp`
- `linalg/include/dsp/linalg/operations/compute_weights_op.hpp`
- `linalg/include/dsp/linalg/operations/covariance_matrix_op.hpp`
- `linalg/python/dsp_linalg_module.cpp`
- `linalg/python/py_capon_rocm.hpp`
- `linalg/python/py_vector_algebra_rocm.hpp`
- `linalg/src/capon/capon_processor.cpp`
- `linalg/src/vector_algebra/cholesky_inverter_rocm.cpp`
- `linalg/src/vector_algebra/diagonal_load_regularizer.cpp`
- `linalg/src/vector_algebra/matrix_ops_rocm.cpp`
- `linalg/src/vector_algebra/symmetrize_gpu_rocm.cpp`
- `linalg/tests/all_test.hpp`
- `linalg/tests/capon_benchmark.hpp`
- `linalg/tests/capon_test_helpers.hpp`
- `linalg/tests/test_benchmark_symmetrize.hpp`
- `linalg/tests/test_capon_benchmark_rocm.hpp`
- `linalg/tests/test_capon_hip_opencl_to_rocm.hpp`
- `linalg/tests/test_capon_reference_data.hpp`
- `linalg/tests/test_capon_rocm.hpp`
- `linalg/tests/test_cholesky_inverter_rocm.hpp`
- `linalg/tests/test_cross_backend_conversion.hpp`
- `linalg/tests/test_stage_profiling.hpp`
- `radar/include/dsp/radar/fm_correlator/fm_correlator.hpp`
- `radar/include/dsp/radar/fm_correlator/kernels/fm_kernels_rocm.hpp`
- `radar/include/dsp/radar/range_angle/kernels/range_angle_kernels_rocm.hpp`
- `radar/include/dsp/radar/range_angle/operations/beam_fft_op.hpp`
- `radar/include/dsp/radar/range_angle/operations/dechirp_window_op.hpp`
- `radar/include/dsp/radar/range_angle/operations/peak_search_op.hpp`
- `radar/include/dsp/radar/range_angle/operations/range_fft_op.hpp`
- `radar/include/dsp/radar/range_angle/operations/transpose_op.hpp`
- `radar/include/dsp/radar/range_angle/range_angle_params.hpp`
- `radar/include/dsp/radar/range_angle/range_angle_processor.hpp`
- `radar/include/dsp/radar/range_angle/range_angle_types.hpp`
- `radar/python/dsp_radar_module.cpp`
- `radar/src/fm_correlator/fm_correlator.cpp`
- `radar/src/fm_correlator/fm_correlator_processor_rocm.cpp`
- `radar/src/range_angle/range_angle_processor.cpp`
- `radar/tests/test_fm_avg_summary.hpp`
- `radar/tests/test_fm_basic.hpp`
- `radar/tests/test_fm_benchmark_rocm_all_time.hpp`
- `radar/tests/test_fm_combined.hpp`
- `radar/tests/test_fm_msequence.hpp`
- `radar/tests/test_fm_step_profiling.hpp`
- `radar/tests/test_range_angle_basic.hpp`
- `radar/tests/test_range_angle_benchmark.hpp`
- `signal_generators/python/dsp_signal_generators_module.cpp`
- `signal_generators/src/signal_generators/cw_generator_rocm.cpp`
- `signal_generators/src/signal_generators/delayed_form_signal_generator_rocm.cpp`
- `signal_generators/src/signal_generators/form_script_generator_rocm.cpp`
- `signal_generators/src/signal_generators/form_signal_generator_rocm.cpp`
- `signal_generators/src/signal_generators/lfm_conjugate_generator_rocm.cpp`
- `signal_generators/src/signal_generators/lfm_generator_analytical_delay_rocm.cpp`
- `signal_generators/src/signal_generators/lfm_generator_rocm.cpp`
- `signal_generators/src/signal_generators/noise_generator_rocm.cpp`
- `signal_generators/src/signal_generators/script_generator_rocm.cpp`
- `signal_generators/tests/all_test.hpp`
- `signal_generators/tests/signal_generators_benchmark_rocm.hpp`
- `signal_generators/tests/test_signal_generators_benchmark_rocm.hpp`
- `signal_generators/tests/test_signal_generators_rocm_basic.hpp`
- `spectrum/include/dsp/spectrum/complex_to_mag_phase_rocm.hpp`
- `spectrum/include/dsp/spectrum/fft_processor_rocm.hpp`
- `spectrum/include/dsp/spectrum/kernels/all_maxima_kernel_sources_rocm.hpp`
- `spectrum/include/dsp/spectrum/kernels/complex_to_mag_phase_kernels_rocm.hpp`
- `spectrum/include/dsp/spectrum/kernels/fft_kernel_sources_rocm.hpp`
- `spectrum/include/dsp/spectrum/kernels/fft_processor_kernels_rocm.hpp`
- `spectrum/include/dsp/spectrum/kernels/lch_farrow_kernels_rocm.hpp`
- `spectrum/include/dsp/spectrum/operations/compute_magnitudes_op.hpp`
- `spectrum/include/dsp/spectrum/operations/mag_phase_op.hpp`
- `spectrum/include/dsp/spectrum/operations/magnitude_op.hpp`
- `spectrum/include/dsp/spectrum/operations/pad_data_op.hpp`
- `spectrum/include/dsp/spectrum/operations/spectrum_pad_op.hpp`
- `spectrum/include/dsp/spectrum/operations/spectrum_post_op.hpp`
- `spectrum/include/dsp/spectrum/pipelines/all_maxima_pipeline_rocm.hpp`
- `spectrum/include/dsp/spectrum/utils/rocm_profiling_helpers.hpp`
- `spectrum/python/dsp_spectrum_module.cpp`
- `spectrum/src/fft_func/all_maxima_pipeline_rocm.cpp`
- `spectrum/src/fft_func/complex_to_mag_phase_rocm.cpp`
- `spectrum/src/fft_func/fft_processor_rocm.cpp`
- `spectrum/src/filters/fir_filter_rocm.cpp`
- `spectrum/src/filters/iir_filter_rocm.cpp`
- `spectrum/src/filters/kalman_filter_rocm.cpp`
- `spectrum/src/filters/kaufman_filter_rocm.cpp`
- `spectrum/src/filters/moving_average_filter_rocm.cpp`
- `spectrum/src/lch_farrow/lch_farrow_rocm.cpp`
- `spectrum/tests/all_test.hpp`
- `spectrum/tests/fft_maxima_benchmark_rocm.hpp`
- `spectrum/tests/fft_processor_benchmark_rocm.hpp`
- `spectrum/tests/filters_benchmark_rocm.hpp`
- `spectrum/tests/lch_farrow_benchmark_rocm.hpp`
- `spectrum/tests/test_complex_to_mag_phase_rocm.hpp`
- `spectrum/tests/test_fft_benchmark_rocm.hpp`
- `spectrum/tests/test_fft_matrix_rocm.hpp`
- `spectrum/tests/test_fft_maxima_benchmark_rocm.hpp`
- `spectrum/tests/test_fft_processor_rocm.hpp`
- `spectrum/tests/test_filters_benchmark_rocm.hpp`
- `spectrum/tests/test_helpers_rocm.hpp`
- `spectrum/tests/test_lch_farrow_benchmark_rocm.hpp`
- `spectrum/tests/test_process_magnitude_rocm.hpp`
- `stats/include/dsp/stats/kernels/gather_decimated_kernel.hpp`
- `stats/include/dsp/stats/kernels/peak_cfar_kernel.hpp`
- `stats/include/dsp/stats/kernels/statistics_kernels_rocm.hpp`
- `stats/include/dsp/stats/operations/mean_reduction_op.hpp`
- `stats/include/dsp/stats/operations/median_histogram_complex_op.hpp`
- `stats/include/dsp/stats/operations/median_histogram_op.hpp`
- `stats/include/dsp/stats/operations/median_radix_sort_op.hpp`
- `stats/include/dsp/stats/operations/snr_estimator_op.hpp`
- `stats/include/dsp/stats/operations/welford_float_op.hpp`
- `stats/include/dsp/stats/operations/welford_fused_op.hpp`
- `stats/include/dsp/stats/statistics_processor.hpp`
- `stats/include/dsp/stats/statistics_sort_gpu.hpp`
- `stats/python/dsp_stats_module.cpp`
- `stats/src/statistics/statistics_processor.cpp`
- `stats/src/statistics/statistics_sort_gpu.hip`
- `stats/tests/all_test.hpp`
- `stats/tests/snr_estimator_benchmark.hpp`
- `stats/tests/snr_test_helpers.hpp`
- `stats/tests/statistics_compute_all_benchmark.hpp`
- `stats/tests/test_helpers_rocm.hpp`
- `stats/tests/test_snr_estimator_benchmark.hpp`
- `stats/tests/test_snr_estimator_rocm.hpp`
- `stats/tests/test_statistics_compute_all_benchmark.hpp`
- `stats/tests/test_statistics_float_rocm.hpp`
- `stats/tests/test_statistics_rocm.hpp`
- `strategies/include/dsp/strategies/antenna_processor_test.hpp`
- `strategies/include/dsp/strategies/antenna_processor_v1.hpp`
- `strategies/include/dsp/strategies/i_pipeline_step.hpp`
- `strategies/include/dsp/strategies/interfaces/i_post_fft_scenario.hpp`
- `strategies/include/dsp/strategies/kernels/strategies_kernels_rocm.hpp`
- `strategies/include/dsp/strategies/pipeline.hpp`
- `strategies/include/dsp/strategies/pipeline_builder.hpp`
- `strategies/include/dsp/strategies/pipeline_context.hpp`
- `strategies/include/dsp/strategies/steps/all_maxima_step.hpp`
- `strategies/include/dsp/strategies/steps/debug_stats_step.hpp`
- `strategies/include/dsp/strategies/steps/gemm_step.hpp`
- `strategies/include/dsp/strategies/steps/minmax_step.hpp`
- `strategies/include/dsp/strategies/steps/one_max_step.hpp`
- `strategies/include/dsp/strategies/steps/window_fft_step.hpp`
- `strategies/include/dsp/strategies/strategies_float_api.hpp`
- `strategies/python/dsp_strategies_module.cpp`
- `strategies/src/strategies/strategies_float_api.cpp`
- `strategies/tests/all_test.hpp`
- `strategies/tests/base_strategy_test.hpp`
- `strategies/tests/debug_step_test.hpp`
- `strategies/tests/i_signal_strategy.hpp`
- `strategies/tests/signal_strategies.hpp`
- `strategies/tests/signal_strategy_factory.hpp`
- `strategies/tests/strategies_profiling_benchmark.hpp`
- `strategies/tests/strategy_test_base.hpp`
- `strategies/tests/test_base_strategy.hpp`
- `strategies/tests/test_debug_steps.hpp`
- `strategies/tests/test_strategies_benchmark_streams.hpp`
- `strategies/tests/test_strategies_pipeline.hpp`
- `strategies/tests/test_strategies_step_profiling.hpp`
- `strategies/tests/timing_per_step_test.hpp`

---

## Группа 2a: с `#else` (47 файлов)

- `DSP/Examples/GetGPU_and_Mellanox/gpu_mellanox_detector.hpp`
- `core/include/core/backends/hybrid/hybrid_backend.hpp`
- `core/include/core/backends/opencl/opencl_export.hpp`
- `core/include/core/backends/rocm/zero_copy_bridge.hpp`
- `core/include/core/gpu_manager.hpp`
- `core/src/drv_gpu.cpp`
- `core/tests/test_phase_c_gate2.hpp`
- `heterodyne/include/dsp/heterodyne/processors/heterodyne_processor_rocm.hpp`
- `heterodyne/src/heterodyne/heterodyne_processor_rocm.cpp`
- `heterodyne/tests/test_heterodyne_basic.hpp`
- `heterodyne/tests/test_heterodyne_pipeline.hpp`
- `heterodyne/tests/test_heterodyne_rocm.hpp`
- `linalg/include/dsp/linalg/capon_processor.hpp`
- `linalg/include/dsp/linalg/cholesky_inverter_rocm.hpp`
- `linalg/include/dsp/linalg/i_matrix_regularizer.hpp`
- `linalg/include/dsp/linalg/matrix_ops_rocm.hpp`
- `linalg/include/dsp/linalg/vector_algebra_types.hpp`
- `linalg/tests/test_capon_opencl_to_rocm.hpp`
- `radar/include/dsp/radar/fm_correlator/fm_correlator_processor_rocm.hpp`
- `radar/tests/all_test.hpp`
- `signal_generators/include/dsp/signal_generators/generators/cw_generator_rocm.hpp`
- `signal_generators/include/dsp/signal_generators/generators/delayed_form_signal_generator_rocm.hpp`
- `signal_generators/include/dsp/signal_generators/generators/form_script_generator_rocm.hpp`
- `signal_generators/include/dsp/signal_generators/generators/form_signal_generator_rocm.hpp`
- `signal_generators/include/dsp/signal_generators/generators/lfm_conjugate_generator_rocm.hpp`
- `signal_generators/include/dsp/signal_generators/generators/lfm_generator_analytical_delay_rocm.hpp`
- `signal_generators/include/dsp/signal_generators/generators/lfm_generator_rocm.hpp`
- `signal_generators/include/dsp/signal_generators/generators/noise_generator_rocm.hpp`
- `signal_generators/include/dsp/signal_generators/generators/script_generator_rocm.hpp`
- `signal_generators/tests/test_form_signal_rocm.hpp`
- `spectrum/include/dsp/spectrum/filters/fir_filter_rocm.hpp`
- `spectrum/include/dsp/spectrum/filters/iir_filter_rocm.hpp`
- `spectrum/include/dsp/spectrum/filters/kalman_filter_rocm.hpp`
- `spectrum/include/dsp/spectrum/filters/kaufman_filter_rocm.hpp`
- `spectrum/include/dsp/spectrum/filters/moving_average_filter_rocm.hpp`
- `spectrum/include/dsp/spectrum/lch_farrow_rocm.hpp`
- `spectrum/include/dsp/spectrum/processors/spectrum_processor_rocm.hpp`
- `spectrum/src/fft_func/spectrum_processor_rocm.cpp`
- `spectrum/tests/test_fft_cpu_reference_rocm.hpp`
- `spectrum/tests/test_filters_rocm.hpp`
- `spectrum/tests/test_gate3_fft_profiler_v2.hpp`
- `spectrum/tests/test_kalman_rocm.hpp`
- `spectrum/tests/test_kaufman_rocm.hpp`
- `spectrum/tests/test_lch_farrow_rocm.hpp`
- `spectrum/tests/test_moving_average_rocm.hpp`
- `spectrum/tests/test_spectrum_maxima_rocm.hpp`
- `strategies/src/strategies/antenna_processor_v1.cpp`

---

## Группа 2b: с `#if !ENABLE_ROCM` (7 файлов)

- `core/include/core/memory/svm_buffer.hpp`
- `signal_generators/include/dsp/signal_generators/generators/delayed_form_signal_generator.hpp`
- `signal_generators/include/dsp/signal_generators/generators/form_signal_generator.hpp`
- `signal_generators/include/dsp/signal_generators/signal_generator_factory.hpp`
- `signal_generators/include/dsp/signal_generators/signal_service.hpp`
- `signal_generators/src/signal_generators/signal_generator_factory.cpp`
- `spectrum/include/dsp/spectrum/lch_farrow.hpp`

---

## Группа 2c: смешанные `#else` + `#if !ENABLE_ROCM` (0 файлов)

