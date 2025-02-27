import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import ytdl from "@distube/ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static"; // Provides a static FFmpeg binary

// TODO FAZER BAIXAR COM QUALIDADE BOA
// PARAR DE QUEBRAR A APLICAÇÃO QUANDO DER ERRO

@Injectable()
export class AppService {

  HDQualityLabels: string[] = [
    '1080p',
    '720p'
  ]

  mergeAudioAndVideo(videosToBeMerged: string[]): Promise<string> {

    const videoPath = videosToBeMerged.find(v => v.indexOf('_video') !== -1);
    const audioPath = videosToBeMerged.find(v => v.indexOf('_audio') !== -1);
    const outputPath = videoPath.replace('_video', '_merged');
  
    ffmpeg.setFfmpegPath(ffmpegStatic as string); // Set static ffmpeg path
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions(["-c:v copy", "-c:a aac"])
        .save(outputPath)
        .on("end", () => {
          console.log("Merge completed!");
          fs.unlinkSync(videoPath);
          fs.unlinkSync(audioPath);
          resolve(`Download and merge completed: ${outputPath}`);
        })
        .on("error", err => {
          console.error("FFmpeg error:", err);
          reject(`FFmpeg error: ${err.message}`);
        });
    });
  }

  selectVideoFormats(formats: ytdl.videoFormat[]): ytdl.videoFormat[] {

    const response : ytdl.videoFormat[] = [];

    // Filter video formats with audio and video
    const formatsWithAudioAndVideo = formats.filter((format) =>
      format.hasAudio
      && format.hasVideo
    )

    response.push(formatsWithAudioAndVideo[0]); // pelo menos ter 1 video completo pra baixar sempre

    const HDVideoWithAudioAndVideo = formatsWithAudioAndVideo.find(format =>
      this.HDQualityLabels.includes(format.qualityLabel)
      && format.mimeType === 'video/mp4'
    )

    if (HDVideoWithAudioAndVideo !== undefined) {
      // Already got the HD video with audio and video, return format
      response.push(HDVideoWithAudioAndVideo);
      return response;
    }

    // se nao tem video em HD com audio e video, pegar um video em HD separado, depois pegar um audio em HD separado e juntar os dois
    const HDVideo = formats.find( format =>
      this.HDQualityLabels.includes(format.qualityLabel)
      && format.hasVideo
      && !format.hasAudio
      && format.container === 'mp4'
      && format.codecs.indexOf('avc1') !== -1 //unico formato que rodou no meu player! usar ele sempre
    )
    const HDAudio = formats.find( format =>
      format.mimeType.indexOf('audio/mp4;') !== -1
      // && format.approxDurationMs === HDVideo.approxDurationMs
      && !format.hasVideo
      && format.hasAudio
    )

    if (HDVideo !== undefined && HDAudio !== undefined) {
      response.push(HDVideo);
      response.push(HDAudio);
      return response;
    }
    
    return response;
  }

  async downloadVideoYTDL(url:string, options: { format?: ytdl.videoFormat }): Promise<string> {
    try {
          // Get video info
          let videoTitle = ';'
          await ytdl.getBasicInfo(url).then(info => {
            console.log(info.videoDetails.title);
            videoTitle = info.videoDetails.title.trim().replace(/[^a-zA-Z0-9]/g, "_");
          });

          // Get video info with download formats
          let info = await ytdl.getInfo(url);

          const selectedFormats = this.selectVideoFormats(info.formats)

          const videosToBeMerged = [];

          for (const format of selectedFormats) {
            options.format = format;
            // console.log('Downloading video with format:', format);
            
            const videoTitleFile = videoTitle
            + (format.hasVideo ? '_video' : '')
            + (format.hasAudio ? '_audio' : '')
            + (format.qualityLabel ? '_'+ format.qualityLabel : '')
            + '.mp4';

            // a code to check if the file already exits and then avoid downloading it again
            if (fs.existsSync(videoTitleFile)) {
              console.log(`File ${videoTitleFile} already exists, skipping download`);
              if (!format.hasVideo || !format.hasAudio) {
                videosToBeMerged.push(videoTitleFile);
                console.log(`File ${videoTitleFile} added to merge process`);
              }
              continue;
            }

            const writeStream = fs.createWriteStream(`${videoTitleFile}`);
            ytdl(url, options).pipe(writeStream);

            await new Promise((resolve, reject) => {
              writeStream.on('finish', () => {
                console.log(`Download of ${videoTitleFile} finished !`);
                resolve('success');
              });
              writeStream.on('error', reject);
            });

            if (!format.hasVideo || !format.hasAudio) {
              videosToBeMerged.push(videoTitleFile);
              console.log(`File ${videoTitleFile} added to merge process`);
            }

          }

          if (videosToBeMerged.length > 0) {
            this.mergeAudioAndVideo(videosToBeMerged);
          }

          return new Promise((resolve, reject) => {
            return resolve('success');
          })
    }
    catch (error) {
      throw new Error(`Failed to download video: ${error.message}`);
    }
  }

  async downloadMultipleVideo(querystring: { urls: string }): Promise<string> {
    try {    
      const urls = querystring.urls.split(',');
      const options = {
      }

      for (const url of urls) {
        const response = await this.downloadVideoYTDL(url, options);
        console.log(url, response);
      }

      return new Promise((resolve, reject) => {
        return resolve('success');
      })
    } catch (error) {
      throw new Error(`Failed to download video: ${error.message}`);
    }
  }

  async downloadVideo(querystring: { url: string }): Promise<string> {
    try {
      const { url } = querystring;
      const options = {
      }
      const response = await this.downloadVideoYTDL(url, options);
      return new Promise((resolve, reject) => {
        return resolve(response);
      })
    } catch (error) {
      throw new Error(`Failed to download video: ${error.message}`);
    }
  }
}
