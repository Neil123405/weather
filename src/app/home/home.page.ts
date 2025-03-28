import { Component, OnInit } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { WeatherService } from '../services/weather.service';
import { Geolocation } from '@capacitor/geolocation';
import { Network } from '@capacitor/network';
import { Capacitor } from '@capacitor/core';
import { ConfigService } from '../services/config.service'

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit {
  weatherData: any;
  forecastData: any;
  hourlyData: any;
  location = { lat: 0, lon: 0 };
  loading = true;
  useManualLocation: boolean = false;
  manualLocation: string = '';
  error: string = '';
  tempUnit: string = 'C';
  isDarkMode = false;
  notificationsEnabled: boolean = true;

  async ngOnInit() {
    await this.loadSettings();
    this.checkInternetAndFetchWeather();
  }

  constructor(private weatherService: WeatherService, private configService: ConfigService) {}

  toggleNotifications() {
    this.configService.updateNotificationPreference(this.notificationsEnabled)
      .then(() => console.log('Notification preference updated'))
      .catch(err => console.error('Error updating preference:', err));
  }

  async loadSettings() {
    const settings = await Preferences.get({ key: 'settings' });
    if (settings.value) {
      const parsedSettings = JSON.parse(settings.value);
      this.tempUnit = parsedSettings.tempUnit || 'C';
      this.isDarkMode = parsedSettings.isDarkMode ?? false; 
      this.applyDarkMode();
    }
  }
  
  applyDarkMode() {
    if (this.isDarkMode) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }
  
  async toggleDarkMode() {
    this.isDarkMode = !this.isDarkMode;
    this.applyDarkMode();
    await Preferences.set({
      key: 'settings',
      value: JSON.stringify({ 
        tempUnit: this.tempUnit, 
        isDarkMode: this.isDarkMode 
      })
    });
  }

  async toggleTemperatureUnit() {
    this.tempUnit = this.tempUnit === 'C' ? 'F' : 'C';
    await Preferences.set({
      key: 'settings',
      value: JSON.stringify({ tempUnit: this.tempUnit, isDarkMode: this.isDarkMode })
    });
    this.applyTemperatureConversion(); 
  }
  
  applyTemperatureConversion() {
    if (!this.weatherData) 
      return;
    if (this.weatherData) {
      this.weatherData.temp = this.tempUnit === 'F'
        ? (this.weatherData.originalTemp * 9/5) + 32
        : this.weatherData.originalTemp;
    } else {
      console.warn("⚠️ No originalTemp found for current weather.");
    }
    if (this.hourlyData) {
      this.hourlyData = this.hourlyData.map((hour: any) => {
        return {
          ...hour,
          temp: this.tempUnit === 'F'
            ? (hour.originalTemp * 9/5) + 32
            : hour.originalTemp
        };
      });
    } else {
      console.warn("⚠️ No originalTemp found for hourly weather.");
    }
    if (this.forecastData) {
      this.forecastData = this.forecastData.map((day: any) => ({
        ...day,
        tempMin: this.tempUnit === 'F'
          ? (day.originalTempMin * 9/5) + 32
          : day.originalTempMin,
        tempMax: this.tempUnit === 'F'
          ? (day.originalTempMax * 9/5) + 32
          : day.originalTempMax
      }));
    } else {
      console.warn("⚠️ No originalTemp found for five day forecast weather.");
    }
  }

  async checkPermissionsAndGetLocation() {
    if(Capacitor.isNativePlatform()) {
      const permStatus = await Geolocation.checkPermissions();
      if(permStatus.location === 'denied') {
        alert('Location permission is denied. Please enable it in Settings');
        return;
      }
      if(permStatus.location === 'prompt') {
        const request = await Geolocation.requestPermissions();
        if (request.location === 'denied') {
          alert('You must allow location permissions');
          return;
        }
      }
    }
    this.getCurrentLocation();
  }

  async checkInternetAndFetchWeather() {
    const status = await Network.getStatus();
    if(!status.connected) {
      alert("No internet connection. Weather data may be unavailable.");
    }
    this.fetchWeather();
  }

  async fetchWeather() {
    this.loading = true;
    this.error = '';
    this.weatherData = null;
    const status = await Network.getStatus();
    if(!status.connected) {
      this.weatherData = await this.weatherService.getCachedData('currentWeather');
      this.hourlyData = await this.weatherService.getCachedData('hourlyForecast');
      this.forecastData = await this.weatherService.getCachedData('fiveDayForecast');
      if(!this.weatherData) {
        this.error = "No cached weather data available.";
      } else {
        this.applyTemperatureConversion(); 
      }
      this.loading = false;
      return;
    }
    if(this.manualLocation.trim()) {
      this.weatherService.getWeatherByCity(this.manualLocation).subscribe(data => {
        this.weatherData = {
          ...data,
          originalTemp: data.temp  
        };
        this.applyTemperatureConversion(); 
      });
      this.weatherService.getHourlyWeatherByCity(this.manualLocation).subscribe(hourly => {
        this.hourlyData = hourly.map((hour: any) => ({
            ...hour,
            originalTemp: hour.temp
        }));
        this.applyTemperatureConversion(); 
      });
      this.weatherService.getFiveDayForecastByCity(this.manualLocation).subscribe(forecast => {
        this.forecastData = forecast.map((day: any) => ({
            ...day,
            originalTempMin: day.tempMin,
            originalTempMax: day.tempMax
        }));
        this.applyTemperatureConversion(); 
      });
      this.loading = false;
    } else {
      this.getCurrentLocation();
      this.loading = false;
    }

  }

  async getCurrentLocation() {
    try {
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });
      this.location.lat = position.coords.latitude;
      this.location.lon = position.coords.longitude;
      this.getWeather();
    } catch (error) {
      alert("Could not retrieve location. Ensure GPS is enabled.");
      this.location.lat = 10.3157;
      this.location.lon = 123.8854;
      this.getWeather();
    }
  }

  getWeather() {
    this.weatherService.getCurrentWeather(this.location.lat, this.location.lon)
      .subscribe(
        data => {
           this.weatherData = {
            ...data,
            originalTemp: data.temp  
          };
          this.weatherService.cacheData('currentWeather', this.weatherData);
        },
        error => {
          alert("Failed to fetch weather. Check your internet connection.");
        }
      );
    this.weatherService.getHourlyWeather(this.location.lat, this.location.lon)
      .subscribe(
        hourly => {
          this.hourlyData = hourly.map((hour: any) => ({
            ...hour,
            originalTemp: hour.temp,
          })); 
          this.weatherService.cacheData('hourlyForecast', this.hourlyData);
        },
        error => {
          alert("Error fetching hourly forecast");
        }
      );
    this.weatherService.getFiveDayForecast(this.location.lat, this.location.lon)
      .subscribe(
        forecast => {
          this.forecastData = forecast.map((day: any) => ({
            ...day,
            originalTempMin: day.tempMin,
            originalTempMax: day.tempMax
          }));
          this.weatherService.cacheData('fiveDayForecast', this.forecastData);
        }, 
        error => {
          alert("Error fetching forecast");
        }
      );
  }

  getWeatherCondition(code: number): string {
    const conditions: { [key: number]: string } = {
      0: "Unknown",
      1000: "Clear",
      1100: "Mostly Clear",
      1101: "Partly Cloudy",
      1102: "Mostly Cloudy",
      1001: "Cloudy",
      2000: "Fog",
      2100: "Light Fog",
      4000: "Drizzle",
      4200: "Light Rain",
      4001: "Rain",
      4201: "Heavy Rain",
      5001: "Flurries",
      5100: "Light Snow",
      5000: "Snow",
      5101: "Heavy Snow",
      6000: "Freezing Drizzle",
      6200: "Light Freezing Rain",
      6001: "Freezing Rain",
      6201: "Heavy Freezing Rain",
      7000: "Ice Pellets",
      7101: "Heavy Ice Pellets",
      7102: "Light Ice Pellets",
      8000: "Thunderstorm"
    };
    return conditions[code] || "Unknown Condition";
  }

}

