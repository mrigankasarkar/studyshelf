 
# 📚 StudyShelf — Your Knowledge, One Shelf Away.

<p align="center">
  <strong>Good notes. Clearer thinking.</strong>
  <br/>
  A simple, accessible and organised digital library for students.
</p>

<p align="center">
  <a href="https://studyshelf121.netlify.app/">
    <img src="https://img.shields.io/badge/Visit-StudyShelf-2563EB?style=for-the-badge&logo=googlechrome&logoColor=white" />
  </a>
  <img src="https://img.shields.io/badge/Status-Active-success?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Platform-Web-orange?style=for-the-badge" />
</p>

---

## 🌟 About StudyShelf

**StudyShelf** is a student-focused digital notes library built to make learning resources easier to discover, organise, access and share.

Finding good study materials shouldn't be difficult. Students often have to search through multiple websites, scattered PDFs, messaging groups and folders just to find the right notes for a particular chapter.

StudyShelf aims to bring these resources together in one organised place.

Whether you're preparing for examinations, revising a difficult chapter or looking for additional learning materials, StudyShelf provides a clean and straightforward environment to access study resources.

**One platform. Organised resources. Better learning.**

🌐 **Live Website:** https://studyshelf121.netlify.app/

---

## ✨ Key Features

### 📖 1. Organised Digital Library
- Access study materials from a centralised library.
- Resources organised by class and subject.
- Find notes according to chapters and categories.
- Easy access to uploaded PDF documents.
- Designed for a simple browsing experience.

### 🔍 2. Smart Search & Filtering
- Search for specific study resources.
- Filter materials by subject.
- Browse resources according to class.
- Find relevant notes without manually searching through endless files.

### 📄 3. Built-in PDF Reader
StudyShelf provides an integrated PDF reading experience.

Features include:
- Read PDF documents directly on the website.
- Zoom in and zoom out.
- Fullscreen reading.
- Reading mode.
- Expandable and collapsible page navigation.
- Smooth document navigation.
- Mobile-friendly reading interface.

No need to download every document just to preview its contents.

### 🔐 4. Dedicated Admin Panel
StudyShelf includes a separate administration interface for managing educational resources.

Administrators can:
- Upload new PDF notes.
- Add class and subject information.
- Organise resources by chapter.
- Categorise notes by type and board.
- View uploaded resources.
- Search and edit existing entries.
- Delete unwanted resources.

The administration interface is separate from the public-facing website.

### ☁️ 5. Cloud-Based Storage
StudyShelf uses Supabase for its backend infrastructure.

- Cloud storage for PDF documents.
- Database-driven resource management.
- Persistent document storage.
- Public access to published learning materials.
- Authentication-based administrative access.

### 📱 6. Responsive Design
StudyShelf is designed to work across different screen sizes.

- Desktop computers
- Laptops
- Tablets
- Smartphones

The goal is to make learning resources accessible wherever students need them.

---

## 🛠️ Technology Stack

StudyShelf is built using lightweight web technologies and cloud-based backend services.

| Technology | Purpose |
|---|---|
| HTML5 | Website structure |
| CSS3 | Styling and responsive layouts |
| JavaScript | Interactivity and functionality |
| Supabase | Backend and database |
| Supabase Storage | PDF document storage |
| Supabase Authentication | Admin authentication |
| Netlify | Website deployment |

### Why this stack?

The project uses a lightweight frontend instead of a large framework. This keeps the application relatively simple, maintainable and suitable for a static website deployment.

Supabase provides the backend infrastructure without requiring a traditional dedicated server.

---

## 🏗️ Project Architecture

StudyShelf follows a simple architecture:

```text
                 STUDYSHELF
                      |
          +-----------+-----------+
          |                       |
     Public Website           Admin Panel
          |                       |
          |                  Authentication
          |                       |
          +-----------+-----------+
                      |
                   Supabase
                      |
          +-----------+-----------+
          |                       |
       Database              Storage
          |                       |
      Note Details            PDF Files
          |                       |
          +-----------+-----------+
                      |
                 PDF Reader
```

The public website retrieves resource information from the database and provides access to the corresponding PDF documents.

The admin panel handles resource management through authenticated administrative operations.

---

## 📂 Project Structure

The project is organised into separate frontend, administration and supporting files.

```text
StudyShelf/
│
├── index.html
├── style.css
├── script.js
│
├── admin.html
├── admin.css
├── admin.js
│
├── assets/
│   └── (Images, icons and other assets)
│
└── README.md
```

*Note: The structure above represents the main project organisation. Additional files and folders may exist in the repository.*

---

## 🚀 Getting Started

Want to run StudyShelf locally or explore its source code?

Follow these steps.

### 1. Clone the repository

```bash
git clone https://github.com/mrigankasarkar/studyshelf.git
```

### 2. Navigate to the project directory

```bash
cd studyshelf
```

### 3. Open the project

Open `index.html` in your browser.

For a better development experience, you can use the Live Server extension in Visual Studio Code.

### 4. Configure Supabase

To run a separate instance with backend functionality:

1. Create a Supabase project.
2. Create the required `notes` database table.
3. Create a storage bucket named `study-notes`.
4. Configure the required database and storage policies.
5. Set up Supabase authentication for the administrator.
6. Configure the project with your own Supabase project credentials.

**Important:** Never expose your Supabase service-role key or other administrative secrets in frontend code. Use only appropriately restricted public credentials.

---

## 🗄️ Database & Storage

StudyShelf uses Supabase to manage resource metadata and uploaded documents.

### Notes Database

The notes table stores information associated with each learning resource.

The resource metadata includes:

| Field | Description |
|---|---|
| Class | Academic class |
| Subject | Subject of the resource |
| Chapter | Related chapter |
| Note Type | Category of learning material |
| Board | Educational board |

An optional teacher field can also be used for additional resource information.

### Storage

PDF documents are stored in the Supabase Storage bucket:

```text
study-notes
```

The database stores the associated resource information, while Supabase Storage handles the actual documents.

### Security

The project uses Row Level Security (RLS) to control database access.

Administrative operations are restricted through authentication and access policies.

---

## 🎯 Project Goals

StudyShelf is built around a few simple principles:

- **Accessibility:** Make study resources easy to access.
- **Organisation:** Keep learning materials structured.
- **Simplicity:** Avoid unnecessary complexity.
- **Availability:** Make resources accessible across devices.
- **Usability:** Provide a comfortable reading experience.
- **Maintainability:** Keep the codebase understandable and manageable.

---

## 🔮 Future Development

StudyShelf is an evolving project. There are several possibilities for future improvements.

Some planned and potential additions include:

- [ ] Student accounts and personalised dashboards.
- [ ] Bookmarks and saved resources.
- [ ] Recently viewed documents.
- [ ] Download management.
- [ ] Advanced search functionality.
- [ ] More detailed resource categorisation.
- [ ] Improved document recommendations.
- [ ] Study progress tracking.
- [ ] Additional educational boards and classes.
- [ ] Improved mobile reading experience.

These ideas may evolve as the project develops.

---

## 🤝 Contributing

Contributions, suggestions and ideas are welcome.

If you would like to contribute:

1. Fork this repository.
2. Create a new branch.

```bash
git checkout -b feature/your-feature
```

3. Make your changes.
4. Commit your changes.

```bash
git commit -m "Add: your feature"
```

5. Push your branch.

```bash
git push origin feature/your-feature
```

6. Open a Pull Request.

Please keep contributions focused, understandable and consistent with the existing project structure.

---

## 📸 Screenshots

Screenshots of the website can be added here to demonstrate the user interface.

Suggested screenshots:

- Homepage
- Resource library
- Search and filtering
- PDF reader
- Administration panel

---

## 👨‍💻 Developer

**Created and maintained by Mriganka Sarkar.**

StudyShelf is an independent educational web project developed with the intention of making academic resources more accessible and organised for students.

- GitHub: https://github.com/mrigankasarkar
- Repository: https://github.com/mrigankasarkar/studyshelf
- Website: https://studyshelf121.netlify.app/

---

## 📜 License

This project is currently distributed without an explicitly specified open-source license.

If you intend to allow others to reuse, modify or redistribute the source code, consider adding an appropriate `LICENSE` file.

---

<p align="center">
  <strong>StudyShelf</strong>
  <br/>
  Good notes. Clearer thinking.
  <br/><br/>
  Made for learners. Built for better access to knowledge.
</p>
