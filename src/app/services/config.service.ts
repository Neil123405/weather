import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  private repo = 'anon446/push';  
  private token = ''; 
  private configUrl = `https://api.github.com/repos/${this.repo}/contents/config.json`;

  constructor(private http: HttpClient) {}

  async updateNotificationPreference(enabled: boolean) {

    const fileData: any = await this.http.get(this.configUrl).toPromise();
    const sha = fileData.sha;

 
    const updatedContent = btoa(JSON.stringify({ notificationsEnabled: enabled }, null, 2));

    
    return this.http.put(this.configUrl, {
      message: 'Update notification preference',
      content: updatedContent,
      sha,
      branch: 'main' 
    }, {
      headers: { Authorization: `token ${this.token}` }
    }).toPromise();
  }
}
