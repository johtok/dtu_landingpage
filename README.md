# DTU Master's Thesis Landing Page

This repository contains the source code for Johannes Nørskov Toke's academic website showcasing his DTU master's thesis research on **Nonlinear Loudspeaker Modeling**. The site is built with [Zola](https://www.getzola.org/) static site generator and features interactive research tools and data visualizations.

## Project Overview

This website serves as a comprehensive platform for presenting master's thesis research on nonlinear electroacoustic systems. The project investigates data-driven methods for identifying and modeling nonlinearities in loudspeakers, combining physical insight with advanced system identification techniques.

### Key Features
- **Personal Landing Page** — Professional academic profile and contact information
- **Interactive Results Dashboard** — Real-time visualization of experimental data and model comparisons
- **Research Timeline** — Dynamic Gantt chart showing project plan and milestones
- **Research Questions Mindmap** — Interactive visualization of research questions and their relationships
- **Experimental Data Repository** — Structured datasets from various modeling approaches including:
  - Linear/Nonlinear baseline models
  - Neural ODE approaches
  - SINDy (Sparse Identification of Nonlinear Dynamics)
  - Dynamic Mode Decomposition (DMD)
  - Reservoir Computing
  - Symbolic Regression

## Development

### Prerequisites
- [Zola](https://www.getzola.org/documentation/getting-started/installation/) static site generator

### Local Development
To serve the site locally with hot reloading:
```bash
zola serve
```
Visit [http://127.0.0.1:1111](http://127.0.0.1:1111) to view the site.

For debug mode (with console logging for the interactive dashboard):
```bash
zola serve
# Then visit http://127.0.0.1:1111/master/results/?debug
```

### Building
To build the static site for production:
```bash
zola build
```
Generated files will be in the `public/` directory.

## Deployment

The site is deployed to DTU's public_html server via automated SSH deployment:

```bash
./deploy.sh
```

This script:
1. Builds the site with `zola build`
2. Ensures the remote directory exists
3. Syncs the `public/` directory to the DTU server with proper permissions
4. Provides deployment confirmation

### Manual Deployment
For manual deployment:
```bash
zola build
rsync -avz --delete --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r public/ gbar:public_html/
```

## Project Structure

```
├── config.toml           # Zola site configuration
├── content/             # Markdown content and pages
│   ├── _index.md       # Homepage content
│   ├── master.md       # Master thesis overview
│   └── master/         # Thesis subsections
│       ├── mindmap.md  # Research questions visualization
│       ├── plan.md     # Project timeline
│       └── results.md  # Interactive results dashboard
├── templates/          # Zola template files
│   ├── index.html      # Homepage template
│   ├── master-*.html   # Specialized thesis templates
│   └── macros/         # Template macros
├── static/             # Static assets
│   ├── master/         # Custom thesis application
│   │   ├── app.js     # Interactive dashboard JavaScript
│   │   └── app.css    # Custom styling
│   └── images/         # Image assets
├── themes/             # Zola themes
│   └── terminimal/     # Terminal-inspired academic theme
├── public/             # Generated site (created by `zola build`)
│   └── master-data/    # Experimental datasets (CSV files)
└── deploy.sh           # Automated deployment script
```

## Research Data

The `public/master-data/` directory contains structured experimental datasets from various modeling approaches:

- **Linear Model Baseline** — Traditional Thiele-Small parameter modeling
- **Nonlinear Model Baseline** — Extended nonlinear modeling approaches  
- **Neural ODE** — Neural ordinary differential equation models
- **SINDy Discovery** — Sparse identification of nonlinear dynamics
- **DMD Baseline** — Dynamic mode decomposition approaches
- **Reservoir Computing** — Echo state network implementations
- **Symbolic Regression** — Automated equation discovery

Each experiment directory contains:
- `loss.csv` — Training/validation loss metrics
- `mse.csv` — Mean squared error measurements
- `pred_*.csv` — Model predictions for different input types
- `spec_*.csv` — Spectral analysis results

## Technology Stack

- **Static Site Generator**: [Zola](https://www.getzola.org/) (Rust-based)
- **Theme**: [Terminimal](https://github.com/pawroman/zola-theme-terminimal) (customized)
- **Visualization**: [Plotly.js](https://plotly.com/javascript/) for interactive charts
- **Styling**: Custom CSS with responsive design
- **Data Format**: CSV files for experimental datasets
- **Deployment**: SSH/rsync to DTU servers

## Interactive Features

The thesis dashboard (`/master/results/`) includes:
- **Real-time Data Filtering** — Search and filter experiments by name, method, or metrics
- **Sortable Results** — Sort by loss, MSE, accuracy, or other performance metrics
- **Interactive Plots** — Zoomable spectrograms and prediction visualizations
- **Comparison Tools** — Side-by-side model performance analysis
- **Data Export** — Download experimental results and visualizations

## Contact

**Johannes Nørskov Toke**  
Master's Student, Technical University of Denmark (DTU)  
Email: s203871@student.dtu.dk  
LinkedIn: [johannes-nørskov-t](https://www.linkedin.com/in/johannes-n%C3%B8rskov-t-6b3a24134/)  
GitHub: [@johtok](https://github.com/johtok)

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

**Note**: The Terminimal theme is licensed separately. See the `themes/terminimal/` directory for theme-specific licensing information.
