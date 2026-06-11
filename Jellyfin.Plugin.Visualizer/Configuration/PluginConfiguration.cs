using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.Visualizer.Configuration;

/// <summary>
/// Available visualizer modes.
/// </summary>
public enum VisualizerMode
{
    /// <summary>
    /// Classic frequency spectrum bars.
    /// </summary>
    Bars,

    /// <summary>
    /// Audio waveform display.
    /// </summary>
    Waveform,

    /// <summary>
    /// Circular spectrum around album art.
    /// </summary>
    Circular,

    /// <summary>
    /// Reactive particle system.
    /// </summary>
    Particles
}

/// <summary>
/// Available color schemes.
/// </summary>
public enum ColorScheme
{
    /// <summary>
    /// Neon purple/cyan gradient.
    /// </summary>
    Neon,

    /// <summary>
    /// Warm orange/red gradient.
    /// </summary>
    Warm,

    /// <summary>
    /// Cool blue/green gradient.
    /// </summary>
    Cool,

    /// <summary>
    /// Rainbow gradient.
    /// </summary>
    Rainbow,

    /// <summary>
    /// Monochrome white.
    /// </summary>
    Mono
}

/// <summary>
/// Plugin configuration.
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>
    /// Gets or sets the default visualizer mode.
    /// </summary>
    public VisualizerMode DefaultMode { get; set; } = VisualizerMode.Bars;

    /// <summary>
    /// Gets or sets the color scheme.
    /// </summary>
    public ColorScheme DefaultColorScheme { get; set; } = ColorScheme.Neon;

    /// <summary>
    /// Gets or sets the audio sensitivity (1-10).
    /// </summary>
    public int Sensitivity { get; set; } = 5;

    /// <summary>
    /// Gets or sets a value indicating whether the visualizer is enabled.
    /// </summary>
    public bool Enabled { get; set; } = true;
}
